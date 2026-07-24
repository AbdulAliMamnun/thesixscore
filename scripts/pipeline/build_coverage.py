#!/usr/bin/env python3
"""TheSixScore citywide coverage pipeline.

Fetches Toronto Open Data via CKAN, joins sources onto the municipal address
spine, and writes static JSON consumed by the Vite client.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "data"
CACHE = ROOT / ".pipeline-cache"

# Resolved package / resource IDs (verified via package_show, Jul 2026)
PACKAGES = {
    "address_points": {
        "id": "abedd8bc-e3dd-4d45-8e69-79165a76e4fa",
        "slug": "address-points-municipal-toronto-one-address-repository",
        "resource": "0b3756af-9caf-4f0f-ac28-9c6617adede4",  # datastore GeoJSON/table
    },
    "rentsafe_eval": {
        "id": "4ef82789-e038-44ef-a478-a8f3590c3eb1",
        "slug": "apartment-building-evaluation",
        # Prefer live 2023+ datastore; also read legacy SCORE resource when present
        "resource_current": "244f7a02-da5c-425b-b55f-fbdd133dd732",
        "resource_legacy_csv": "979fb513-5186-41e9-bb23-7b5cc6b89915",
        "resource_legacy_ds": "b987be09-0c62-4d7d-928c-4a1ecaeaf3f3",
    },
    "registration": {
        "id": "2b98b3f3-4f3a-42a4-a4e9-b44d3026595a",
        "slug": "apartment-building-registration",
        "resource": "3ad76a8c-0518-4df2-b94e-8c747d62f8c1",
    },
    "mls": {
        "id": "5da2e2e8-659e-4850-ae43-47b7f7ad6b62",
        "slug": "municipal-licensing-and-standards-investigation-activity",
        "resource_zip": "5633cb87-19fc-4735-82af-80ad8b48657e",
    },
    "str": {
        "id": "2ab20f80-3599-486a-8f8a-9cb59117977c",
        "slug": "short-term-rentals-registration",
        "resource": "f4659cc1-8985-4e4a-a702-ae24352271e0",
    },
    "multi_tenant": {
        "id": "a3a1d939-f792-4ac5-8b7c-a25648a7a98b",
        "slug": "multi-tenant-house-licences",
        "resource": "8452b57a-424c-4440-8030-7eed8306f438",
    },
    "permits_active": {
        "id": "108c2bd1-6945-46f6-af92-02f5658ee7f7",
        "slug": "building-permits-active-permits",
        "resource": "6d0229af-bc54-46de-9c2b-26759b01dd05",
    },
    "permits_cleared": {
        "id": "9e42a85b-180f-4dc5-b0d7-d46661a6c0ec",
        "slug": "building-permits-cleared-permits",
        "resource": "a96c0ba4-3026-402b-b09d-5b1268b8f810",
    },
}

STREET_EXPAND = {
    "STREET": "ST",
    "AVENUE": "AVE",
    "BOULEVARD": "BLVD",
    "DRIVE": "DR",
    "ROAD": "RD",
    "COURT": "CRT",
    "CRESCENT": "CRES",
    "PLACE": "PL",
    "TERRACE": "TERR",
    "GARDEN": "GDN",
    "GARDENS": "GDNS",
    "PARKWAY": "PKWY",
    "CIRCLE": "CIR",
    "LANE": "LN",
    "TRAIL": "TRL",
    "GATE": "GT",
    "SQUARE": "SQ",
    "HEIGHTS": "HTS",
}

DIR_EXPAND = {
    "NORTH": "N",
    "SOUTH": "S",
    "EAST": "E",
    "WEST": "W",
    "NORTHWEST": "NW",
    "NORTHEAST": "NE",
    "SOUTHWEST": "SW",
    "SOUTHEAST": "SE",
}

HAZARD_RE = re.compile(
    r"\b(hazard|hazardous|emergency|unsafe|fire\s*escape|structural|collapse|"
    r"gas\s*leak|carbon\s*monoxide|electrical\s*hazard|immediate\s*danger)\b",
    re.I,
)

UNIT_RE = re.compile(
    r"^(?:UNIT|APT|APARTMENT|STE|SUITE|#)\s*[-A-Z0-9]+[,]?\s+",
    re.I,
)
RANGE_RE = re.compile(r"^(\d+)\s*[-–]\s*\d+")


def log(msg: str) -> None:
    print(msg, flush=True)


def http_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "TheSixScorePipeline/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.load(resp)


def http_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "TheSixScorePipeline/1.0"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        return resp.read()


def ckan_action(action: str, **params: Any) -> Any:
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    data = http_json(f"{CKAN}/{action}?{qs}")
    if not data.get("success"):
        raise RuntimeError(f"CKAN {action} failed: {data}")
    return data["result"]


def strip_diacritics(value: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c)
    )


def clean_token(value: str | None) -> str:
    if value is None:
        return ""
    text = strip_diacritics(str(value)).upper().strip()
    text = re.sub(r"[.,#]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text


def normalize_street_type(value: str | None) -> str:
    token = clean_token(value)
    return STREET_EXPAND.get(token, token)


def normalize_dir(value: str | None) -> str:
    token = clean_token(value)
    return DIR_EXPAND.get(token, token)


def canonical_key(
    number: Any,
    street: Any,
    street_type: Any = "",
    direction: Any = "",
) -> str | None:
    raw_num = clean_token(number)
    if not raw_num:
        return None
    # Keep low number from ranges / strip unit prefixes from full lines later
    m = RANGE_RE.match(raw_num.replace(" ", ""))
    if m:
        raw_num = m.group(1)
    else:
        m2 = re.match(r"^(\d+)", raw_num)
        raw_num = m2.group(1) if m2 else raw_num

    street_name = clean_token(street)
    if not street_name:
        return None
    stype = normalize_street_type(street_type)
    direction = normalize_dir(direction)
    parts = [raw_num, street_name]
    if stype:
        parts.append(stype)
    if direction:
        parts.append(direction)
    return " ".join(parts)


def canonical_from_freeform(address: str | None) -> str | None:
    if not address:
        return None
    text = clean_token(address)
    text = UNIT_RE.sub("", text)
    text = re.sub(r"\bTORONTO\b.*$", "", text).strip()
    # Split number + rest
    m = re.match(r"^(\d+[A-Z]?)\s+(.+)$", text)
    if not m:
        return None
    num, rest = m.group(1), m.group(2)
    tokens = rest.split()
    direction = ""
    stype = ""
    if tokens and tokens[-1] in DIR_EXPAND.values() or tokens and tokens[-1] in DIR_EXPAND:
        direction = normalize_dir(tokens[-1])
        tokens = tokens[:-1]
    if tokens and (tokens[-1] in STREET_EXPAND or tokens[-1] in STREET_EXPAND.values()):
        stype = normalize_street_type(tokens[-1])
        tokens = tokens[:-1]
    street = " ".join(tokens)
    return canonical_key(num, street, stype, direction)


def parse_geometry(geom: Any) -> tuple[float | None, float | None]:
    if geom is None:
        return None, None
    if isinstance(geom, str):
        try:
            geom = json.loads(geom)
        except json.JSONDecodeError:
            return None, None
    if isinstance(geom, dict) and geom.get("type") == "Point":
        coords = geom.get("coordinates") or []
        if len(coords) >= 2:
            return float(coords[1]), float(coords[0])
    return None, None


def datastore_all(
    resource_id: str,
    fields: str | None = None,
    page_size: int = 32000,
    max_records: int | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    total = None
    while True:
        params: dict[str, Any] = {
            "resource_id": resource_id,
            "limit": page_size,
            "offset": offset,
        }
        if fields:
            params["fields"] = fields
        result = ckan_action("datastore_search", **params)
        total = result.get("total", 0)
        batch = result.get("records") or []
        rows.extend(batch)
        log(f"  datastore {resource_id[:8]}… offset={offset} got={len(batch)} total_so_far={len(rows)}/{total}")
        offset += len(batch)
        if not batch or offset >= total:
            break
        if max_records is not None and len(rows) >= max_records:
            rows = rows[:max_records]
            break
        time.sleep(0.05)
    return rows


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class Spine:
    def __init__(self) -> None:
        self.by_id: dict[str, dict[str, Any]] = {}
        self.by_key: dict[str, list[str]] = defaultdict(list)
        self.grid: dict[tuple[int, int], list[str]] = defaultdict(list)

    def add(self, row: dict[str, Any]) -> None:
        ap_id = str(row.get("ADDRESS_POINT_ID") or "").strip()
        if not ap_id:
            return
        lat, lng = parse_geometry(row.get("geometry"))
        key = canonical_key(
            row.get("LO_NUM") or row.get("ADDRESS_NUMBER"),
            row.get("LINEAR_NAME"),
            row.get("LINEAR_NAME_TYPE"),
            row.get("LINEAR_NAME_DIR"),
        )
        rec = {
            "addressPointId": ap_id,
            "canonicalAddress": clean_token(row.get("ADDRESS_FULL") or key or ap_id),
            "canonicalKey": key,
            "ward": (row.get("WARD_NAME") or "").strip() or None,
            "lat": lat,
            "lng": lng,
            "centrelineId": str(row.get("CENTRELINE_ID") or "") or None,
        }
        self.by_id[ap_id] = rec
        if key:
            self.by_key[key].append(ap_id)
        if lat is not None and lng is not None:
            self.grid[self._cell(lat, lng)].append(ap_id)

    @staticmethod
    def _cell(lat: float, lng: float) -> tuple[int, int]:
        # ~25m cells
        return (int(lat / 0.000225), int(lng / 0.00030))

    def resolve(
        self,
        *,
        address_point_id: str | None = None,
        centreline_id: str | None = None,
        key: str | None = None,
        lat: float | None = None,
        lng: float | None = None,
    ) -> str | None:
        if address_point_id and address_point_id in self.by_id:
            return address_point_id
        if key and key in self.by_key:
            return self.by_key[key][0]
        if centreline_id:
            # rare path — linear scan avoided; centreline used only if keyed later
            pass
        if lat is not None and lng is not None:
            best_id = None
            best_d = 26.0
            for di in range(-1, 2):
                for dj in range(-1, 2):
                    cell = (self._cell(lat, lng)[0] + di, self._cell(lat, lng)[1] + dj)
                    for ap_id in self.grid.get(cell, []):
                        rec = self.by_id[ap_id]
                        if rec["lat"] is None or rec["lng"] is None:
                            continue
                        d = haversine_m(lat, lng, rec["lat"], rec["lng"])
                        if d < best_d:
                            best_d = d
                            best_id = ap_id
            return best_id
        return None


def as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def as_score(row: dict[str, Any]) -> float | None:
    for field in (
        "SCORE",
        "CURRENT BUILDING EVAL SCORE",
        "CURRENT_BUILDING_EVAL_SCORE",
        "PROACTIVE BUILDING SCORE",
        "PROACTIVE_BUILDING_SCORE",
    ):
        # case-insensitive
        for k, v in row.items():
            if k.upper().replace("_", " ") == field.upper().replace("_", " "):
                n = as_float(v)
                if n is not None:
                    return n
    return None


def get_ci(row: dict[str, Any], *names: str) -> Any:
    lookup = {k.upper().replace(" ", "_"): v for k, v in row.items()}
    for name in names:
        key = name.upper().replace(" ", "_")
        if key in lookup and lookup[key] not in (None, ""):
            return lookup[key]
    # also try space form
    lookup2 = {k.upper(): v for k, v in row.items()}
    for name in names:
        if name.upper() in lookup2 and lookup2[name.upper()] not in (None, ""):
            return lookup2[name.upper()]
    return None


def ensure_record(
    bag: dict[str, dict[str, Any]],
    spine: Spine,
    ap_id: str,
) -> dict[str, Any]:
    if ap_id in bag:
        return bag[ap_id]
    base = spine.by_id[ap_id]
    rec = {
        "addressPointId": ap_id,
        "canonicalAddress": base["canonicalAddress"],
        "ward": base["ward"],
        "lat": base["lat"],
        "lng": base["lng"],
        "tier": 3,
        "rentSafeScore": None,
        "rentSafe": None,
        "signals": [],
        "hazardFlag": False,
    }
    bag[ap_id] = rec
    return rec


def add_signal(
    rec: dict[str, Any],
    *,
    source: str,
    detail: str,
    last_date: str | None = None,
    count: int = 1,
    hazard: bool = False,
) -> None:
    signals: list[dict[str, Any]] = rec["signals"]
    for existing in signals:
        if existing["source"] == source and existing.get("detail") == detail:
            existing["count"] = int(existing.get("count") or 0) + count
            if last_date and (not existing.get("lastDate") or last_date > existing["lastDate"]):
                existing["lastDate"] = last_date
            if hazard:
                rec["hazardFlag"] = True
            if rec["tier"] == 3 and rec.get("rentSafeScore") is None:
                rec["tier"] = 2
            return
    signals.append(
        {
            "source": source,
            "count": count,
            "lastDate": last_date,
            "detail": detail,
        }
    )
    if hazard:
        rec["hazardFlag"] = True
    if rec["tier"] == 3 and rec.get("rentSafeScore") is None:
        rec["tier"] = 2


def dedupe_rentsafe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best: dict[str, dict[str, Any]] = {}
    for row in rows:
        rsn = str(get_ci(row, "RSN") or "").strip()
        if not rsn:
            continue
        date = str(get_ci(row, "EVALUATION_COMPLETED_ON", "EVALUATION COMPLETED ON") or "")
        year = str(get_ci(row, "YEAR_EVALUATED", "YEAR EVALUATED") or "")
        score_key = (date or year, as_score(row) or -1)
        prev = best.get(rsn)
        if not prev:
            best[rsn] = row
            continue
        prev_date = str(get_ci(prev, "EVALUATION_COMPLETED_ON", "EVALUATION COMPLETED ON") or "")
        prev_year = str(get_ci(prev, "YEAR_EVALUATED", "YEAR EVALUATED") or "")
        prev_key = (prev_date or prev_year, as_score(prev) or -1)
        if score_key >= prev_key:
            best[rsn] = row
    return list(best.values())


def build(quick: bool = False) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    max_spine = 80000 if quick else None
    max_secondary = 50000 if quick else None

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sources_meta: list[dict[str, Any]] = []

    log("== Loading address spine ==")
    spine_fields = (
        "ADDRESS_POINT_ID,LO_NUM,ADDRESS_NUMBER,LINEAR_NAME,LINEAR_NAME_TYPE,"
        "LINEAR_NAME_DIR,ADDRESS_FULL,WARD_NAME,CENTRELINE_ID,geometry"
    )
    spine_rows = datastore_all(
        PACKAGES["address_points"]["resource"],
        fields=spine_fields,
        max_records=max_spine,
    )
    spine = Spine()
    for row in spine_rows:
        spine.add(row)
    log(f"Spine addresses: {len(spine.by_id)}")
    sources_meta.append(
        {
            "key": "address_points",
            "title": "Address Points (Municipal Toronto)",
            "packageId": PACKAGES["address_points"]["id"],
            "packageSlug": PACKAGES["address_points"]["slug"],
            "resourceId": PACKAGES["address_points"]["resource"],
            "recordsIngested": len(spine_rows),
            "refreshedAt": generated_at,
        }
    )

    bag: dict[str, dict[str, Any]] = {}

    # ---- Tier 1: RentSafeTO evaluations ----
    log("== Tier 1: RentSafeTO evaluations ==")
    eval_rows = datastore_all(
        PACKAGES["rentsafe_eval"]["resource_current"],
        max_records=max_secondary,
    )
    # Merge legacy SCORE rows for any RSNs missing numeric score
    try:
        legacy_rows = datastore_all(
            PACKAGES["rentsafe_eval"]["resource_legacy_ds"],
            max_records=max_secondary,
        )
    except Exception as exc:
        log(f"Legacy RentSafe datastore skipped: {exc}")
        legacy_rows = []

    eval_by_rsn = {str(get_ci(r, "RSN")): r for r in dedupe_rentsafe(eval_rows)}
    for row in dedupe_rentsafe(legacy_rows):
        rsn = str(get_ci(row, "RSN") or "")
        if not rsn:
            continue
        if rsn not in eval_by_rsn:
            eval_by_rsn[rsn] = row
        elif as_score(eval_by_rsn[rsn]) is None and as_score(row) is not None:
            eval_by_rsn[rsn] = row

    matched_eval = 0
    for row in eval_by_rsn.values():
        score = as_score(row)
        addr = str(get_ci(row, "SITE_ADDRESS", "SITE ADDRESS") or "")
        key = canonical_from_freeform(addr)
        lat = as_float(get_ci(row, "LATITUDE"))
        lng = as_float(get_ci(row, "LONGITUDE"))
        ap_id = spine.resolve(key=key, lat=lat, lng=lng)
        if not ap_id:
            continue
        rec = ensure_record(bag, spine, ap_id)
        rec["tier"] = 1
        rec["rentSafeScore"] = score
        rec["rentSafe"] = {
            "rsn": str(get_ci(row, "RSN") or ""),
            "siteAddress": addr,
            "propertyType": get_ci(row, "PROPERTY_TYPE", "PROPERTY TYPE"),
            "storeys": get_ci(row, "CONFIRMED_STOREYS", "CONFIRMED STOREYS"),
            "units": get_ci(row, "CONFIRMED_UNITS", "CONFIRMED UNITS"),
            "resultsOfScore": get_ci(row, "RESULTS_OF_SCORE", "RESULTS OF SCORE"),
            "evaluatedOn": get_ci(
                row, "EVALUATION_COMPLETED_ON", "EVALUATION COMPLETED ON"
            ),
            "yearEvaluated": get_ci(row, "YEAR_EVALUATED", "YEAR EVALUATED"),
        }
        matched_eval += 1
    log(f"RentSafe matched to spine: {matched_eval}")
    sources_meta.append(
        {
            "key": "rentsafe_evaluation",
            "title": "Apartment Building Evaluation (RentSafeTO)",
            "packageId": PACKAGES["rentsafe_eval"]["id"],
            "packageSlug": PACKAGES["rentsafe_eval"]["slug"],
            "resourceId": PACKAGES["rentsafe_eval"]["resource_current"],
            "recordsIngested": len(eval_rows) + len(legacy_rows),
            "refreshedAt": generated_at,
            "tier": 1,
        }
    )

    # ---- Tier 2 signals ----
    log("== Tier 2: Apartment Building Registration ==")
    reg_rows = datastore_all(
        PACKAGES["registration"]["resource"], max_records=max_secondary
    )
    for row in reg_rows:
        addr = str(get_ci(row, "SITE_ADDRESS") or "")
        key = canonical_from_freeform(addr)
        ap_id = spine.resolve(key=key)
        if not ap_id:
            continue
        rec = ensure_record(bag, spine, ap_id)
        if rec["tier"] != 1:
            rec["tier"] = 2
        add_signal(
            rec,
            source="Apartment Building Registration",
            detail=f"Registered purpose-built rental ({get_ci(row, 'PROPERTY_TYPE') or 'type n/a'})",
            last_date=str(get_ci(row, "DATE_OF_LAST_INSPECTION_BY_TSSA") or "") or None,
        )
    sources_meta.append(
        {
            "key": "apartment_registration",
            "title": "Apartment Building Registration",
            "packageId": PACKAGES["registration"]["id"],
            "packageSlug": PACKAGES["registration"]["slug"],
            "resourceId": PACKAGES["registration"]["resource"],
            "recordsIngested": len(reg_rows),
            "refreshedAt": generated_at,
            "tier": 2,
        }
    )

    log("== Tier 2: Short-Term Rentals ==")
    str_rows = datastore_all(PACKAGES["str"]["resource"], max_records=max_secondary)
    for row in str_rows:
        addr = str(row.get("address") or "")
        key = canonical_from_freeform(addr)
        ap_id = spine.resolve(key=key)
        if not ap_id:
            continue
        rec = ensure_record(bag, spine, ap_id)
        if rec["tier"] != 1:
            rec["tier"] = 2
        prop = row.get("property_type") or "property"
        add_signal(
            rec,
            source="Short-Term Rentals Registration",
            detail=f"STR registration ({prop})",
        )
    sources_meta.append(
        {
            "key": "short_term_rentals",
            "title": "Short-Term Rentals Registration",
            "packageId": PACKAGES["str"]["id"],
            "packageSlug": PACKAGES["str"]["slug"],
            "resourceId": PACKAGES["str"]["resource"],
            "recordsIngested": len(str_rows),
            "refreshedAt": generated_at,
            "tier": 2,
        }
    )

    log("== Tier 2: Multi-Tenant House Licences ==")
    mt_rows = datastore_all(
        PACKAGES["multi_tenant"]["resource"], max_records=max_secondary
    )
    for row in mt_rows:
        addr = str(row.get("SiteAddress") or row.get("SITE_ADDRESS") or "")
        key = canonical_from_freeform(addr)
        ap_id = spine.resolve(key=key)
        if not ap_id:
            continue
        rec = ensure_record(bag, spine, ap_id)
        if rec["tier"] != 1:
            rec["tier"] = 2
        add_signal(
            rec,
            source="Multi-Tenant House Licences",
            detail=f"Licence status: {row.get('Status') or 'n/a'}",
        )
    sources_meta.append(
        {
            "key": "multi_tenant_houses",
            "title": "Multi-Tenant (Rooming) House Licences",
            "packageId": PACKAGES["multi_tenant"]["id"],
            "packageSlug": PACKAGES["multi_tenant"]["slug"],
            "resourceId": PACKAGES["multi_tenant"]["resource"],
            "recordsIngested": len(mt_rows),
            "refreshedAt": generated_at,
            "tier": 2,
        }
    )

    log("== Tier 2: Building Permits (active) ==")
    permit_rows = datastore_all(
        PACKAGES["permits_active"]["resource"], max_records=max_secondary
    )
    for row in permit_rows:
        # Prefer residential-related permits to reduce industrial noise
        residential = str(row.get("RESIDENTIAL") or "").strip()
        structure = str(row.get("STRUCTURE_TYPE") or "").upper()
        if residential in ("", "0", "0.0") and "RESIDENTIAL" not in structure and "APARTMENT" not in structure and "CONDO" not in structure and "HOUSE" not in structure:
            # still include if CURRENT_USE looks residential
            use = f"{row.get('CURRENT_USE') or ''} {row.get('PROPOSED_USE') or ''}".upper()
            if not any(x in use for x in ("RESIDENTIAL", "APARTMENT", "CONDO", "HOUSE", "DWELLING")):
                continue
        key = canonical_key(
            row.get("STREET_NUM"),
            row.get("STREET_NAME"),
            row.get("STREET_TYPE"),
            row.get("STREET_DIRECTION"),
        )
        ap_id = spine.resolve(key=key)
        if not ap_id:
            continue
        rec = ensure_record(bag, spine, ap_id)
        if rec["tier"] != 1:
            rec["tier"] = 2
        work = row.get("WORK") or row.get("PERMIT_TYPE") or "Permit"
        add_signal(
            rec,
            source="Building Permits (Active)",
            detail=str(work)[:160],
            last_date=str(row.get("ISSUED_DATE") or row.get("APPLICATION_DATE") or "")
            or None,
        )
    sources_meta.append(
        {
            "key": "building_permits_active",
            "title": "Building Permits — Active",
            "packageId": PACKAGES["permits_active"]["id"],
            "packageSlug": PACKAGES["permits_active"]["slug"],
            "resourceId": PACKAGES["permits_active"]["resource"],
            "recordsIngested": len(permit_rows),
            "refreshedAt": generated_at,
            "tier": 2,
        }
    )

    if not quick:
        log("== Tier 2: Building Permits (cleared, recent sample via page cap) ==")
        cleared_rows = datastore_all(
            PACKAGES["permits_cleared"]["resource"],
            max_records=80000,
        )
        for row in cleared_rows:
            issued = str(row.get("ISSUED_DATE") or "")
            if issued and issued < "2022-01-01":
                continue
            key = canonical_key(
                row.get("STREET_NUM"),
                row.get("STREET_NAME"),
                row.get("STREET_TYPE"),
                row.get("STREET_DIRECTION"),
            )
            ap_id = spine.resolve(key=key)
            if not ap_id:
                continue
            rec = ensure_record(bag, spine, ap_id)
            if rec["tier"] != 1:
                rec["tier"] = 2
            add_signal(
                rec,
                source="Building Permits (Cleared)",
                detail=str(row.get("WORK") or row.get("PERMIT_TYPE") or "Cleared permit")[:160],
                last_date=issued or None,
            )
        sources_meta.append(
            {
                "key": "building_permits_cleared",
                "title": "Building Permits — Cleared",
                "packageId": PACKAGES["permits_cleared"]["id"],
                "packageSlug": PACKAGES["permits_cleared"]["slug"],
                "resourceId": PACKAGES["permits_cleared"]["resource"],
                "recordsIngested": len(cleared_rows),
                "refreshedAt": generated_at,
                "tier": 2,
            }
        )

    log("== Tier 2: MLS Investigation Activity ==")
    mls_url = (
        f"https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/"
        f"{PACKAGES['mls']['id']}/resource/{PACKAGES['mls']['resource_zip']}/download/"
        f"mls_investigations_csv.zip"
    )
    # resource download path may redirect; use package resource url
    pkg = ckan_action("package_show", id=PACKAGES["mls"]["id"])
    zip_url = next(
        r["url"]
        for r in pkg["resources"]
        if r["id"] == PACKAGES["mls"]["resource_zip"]
    )
    zbytes = http_bytes(zip_url)
    mls_count = 0
    with zipfile.ZipFile(io.BytesIO(zbytes)) as zf:
        addr_name = next(n for n in zf.namelist() if n.lower().endswith("addresses.csv"))
        inv_name = next(n for n in zf.namelist() if n.lower().endswith("investigations.csv"))
        def_name = next(n for n in zf.namelist() if n.lower().endswith("deficiencies.csv"))
        with zf.open(addr_name) as fh:
            text = io.TextIOWrapper(fh, encoding="utf-8-sig", errors="replace")
            addr_rows = list(csv.DictReader(text))
        with zf.open(inv_name) as fh:
            text = io.TextIOWrapper(fh, encoding="utf-8-sig", errors="replace")
            inv_by_id = {
                (row.get("INVESTIGATION_ID") or "").strip(): row
                for row in csv.DictReader(text)
            }
        with zf.open(def_name) as fh:
            text = io.TextIOWrapper(fh, encoding="utf-8-sig", errors="replace")
            defs = list(csv.DictReader(text))

        open_hazard_ids: set[str] = set()
        open_def_counts: dict[str, int] = defaultdict(int)
        for drow in defs:
            iid = (drow.get("INVESTIGATION_ID") or "").strip()
            status = (drow.get("Status") or "").strip().lower()
            if status == "open":
                open_def_counts[iid] += 1
                if HAZARD_RE.search(drow.get("Desc") or ""):
                    open_hazard_ids.add(iid)

        if quick:
            addr_rows = addr_rows[:20000]

        for arow in addr_rows:
            iid = (arow.get("INVESTIGATION_ID") or arow.get("\ufeffINVESTIGATION_ID") or "").strip()
            key = canonical_key(
                arow.get("House"),
                arow.get("Street"),
                arow.get("Type"),
                arow.get("Direction"),
            )
            if not key:
                key = canonical_from_freeform(arow.get("AddrLine"))
            ap_id = spine.resolve(key=key)
            if not ap_id:
                continue
            rec = ensure_record(bag, spine, ap_id)
            if rec["tier"] != 1:
                rec["tier"] = 2
            inv = inv_by_id.get(iid) or {}
            issue = inv.get("Issue") or inv.get("InType") or "MLS investigation"
            last = inv.get("InDate") or inv.get("NoticeDate")
            hazard = iid in open_hazard_ids
            detail = f"{issue}"
            if open_def_counts.get(iid):
                detail += f" · {open_def_counts[iid]} open deficiency(ies)"
            add_signal(
                rec,
                source="MLS Investigation Activity",
                detail=detail[:200],
                last_date=str(last or "") or None,
                hazard=hazard,
            )
            mls_count += 1
    log(f"MLS address rows matched: {mls_count}")
    sources_meta.append(
        {
            "key": "mls_investigations",
            "title": "Municipal Licensing & Standards Investigation Activity",
            "packageId": PACKAGES["mls"]["id"],
            "packageSlug": PACKAGES["mls"]["slug"],
            "resourceId": PACKAGES["mls"]["resource_zip"],
            "recordsIngested": mls_count,
            "refreshedAt": generated_at,
            "tier": 2,
        }
    )

    # ---- Write outputs ----
    log("== Writing static JSON ==")
    evidence = sorted(bag.values(), key=lambda r: r["canonicalAddress"] or "")
    for rec in evidence:
        if rec.get("rentSafeScore") is not None:
            rec["tier"] = 1
        elif rec.get("signals"):
            rec["tier"] = 2
        else:
            rec["tier"] = 3

    # Search index (compact) for evidence + spine lite shards by first letter
    index = [
        {
            "id": r["addressPointId"],
            "a": r["canonicalAddress"],
            "w": r["ward"],
            "t": r["tier"],
            "s": r["rentSafeScore"],
            "h": bool(r["hazardFlag"]),
        }
        for r in evidence
    ]

    spine_shards: dict[str, list[list[Any]]] = defaultdict(list)
    for rec in spine.by_id.values():
        full = rec["canonicalAddress"] or ""
        letter = re.sub(r"^[^A-Z]+", "", full.upper())[:1] or "#"
        spine_shards[letter].append(
            [
                rec["addressPointId"],
                full,
                rec["ward"],
                rec["lat"],
                rec["lng"],
            ]
        )

    meta = {
        "generatedAt": generated_at,
        "app": "TheSixScore",
        "model": "three-tier-evidence",
        "correctionEmail": "corrections@thesixscore.example",
        "counts": {
            "spine": len(spine.by_id),
            "evidence": len(evidence),
            "tier1": sum(1 for r in evidence if r["tier"] == 1),
            "tier2": sum(1 for r in evidence if r["tier"] == 2),
            "tier3SpineAvailable": len(spine.by_id),
        },
        "sources": sources_meta,
        "notes": [
            "GENERAL_USE on Address Points is not used for residential classification (blank/unknown since 2021-07-29).",
            "Tier 1 = City-inspected RentSafeTO score. Tier 2 = public-record signals only (no letter grade). Tier 3 = no public records found.",
            "Neighbourhood police/crime data is never included.",
            "Few records never lower a grade (small-building fairness).",
        ],
    }

    (OUT / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    (OUT / "evidence.json").write_text(json.dumps(evidence), encoding="utf-8")
    (OUT / "index.json").write_text(json.dumps(index), encoding="utf-8")

    shard_dir = OUT / "spine"
    if shard_dir.exists():
        for old in shard_dir.glob("*.json"):
            old.unlink()
    shard_dir.mkdir(parents=True, exist_ok=True)
    shard_manifest = {}
    for letter, rows in sorted(spine_shards.items()):
        rows.sort(key=lambda x: x[1])
        path = shard_dir / f"{letter}.json"
        path.write_text(json.dumps(rows), encoding="utf-8")
        shard_manifest[letter] = len(rows)
    (OUT / "spine-manifest.json").write_text(
        json.dumps({"letters": shard_manifest, "generatedAt": generated_at}, indent=2),
        encoding="utf-8",
    )

    log(
        f"Done. evidence={len(evidence)} tier1={meta['counts']['tier1']} "
        f"tier2={meta['counts']['tier2']} spine={len(spine.by_id)} -> {OUT}"
    )


if __name__ == "__main__":
    quick = "--quick" in sys.argv
    if "--full" in sys.argv:
        quick = False
    build(quick=quick)
