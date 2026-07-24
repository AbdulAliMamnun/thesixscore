#!/usr/bin/env node
/**
 * TheSixScore build-time data pipeline.
 *
 * Verified Toronto CKAN package ids only for official rating/spine.
 * UNVERIFIED at build time (must be confirmed dynamically):
 * - CKAN resource ids / column names (via package_show + datastore fields)
 * - Overture Maps release id (yyyy-mm-dd.x)
 * - Foursquare OS Places dump availability
 * - RHRA / Ontario LTC reuse terms (gated by SENIORS_SIGNAL_ENABLED)
 */

import { execFile } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  asNumber,
  canonicalFromFreeform,
  canonicalKey,
} from './lib/address.ts'
import {
  CkanError,
  datastoreAll,
  downloadToFile,
  getField,
  packageShow,
  pickDatastoreResource,
  requireColumns,
  writeJson,
} from './lib/ckan.ts'
import {
  APACHE_2,
  CC0,
  CDLA_PERMISSIVE,
  CDLA_PERMISSIVE_TEXT,
  FOURSQUARE_NOTICE_PLACEHOLDER,
  ODBL_NOTE,
  OGL_TORONTO,
} from './lib/licences.ts'
import { AddressSpine, buildingIdFor, buildingSlug } from './lib/spine.ts'
import type {
  BuildingDoc,
  BuildingRecord,
  BuildingSignal,
  PipelineConfig,
  SourceAttribution,
} from './lib/types.ts'
import {
  extractAreasEvaluated,
  extractCategoryScores,
} from '../src/lib/categories.ts'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'data')
const CACHE = path.join(ROOT, '.pipeline-cache')

/** Verified package ids — do not invent others for official rating. */
const VERIFIED = {
  addressPoints: 'abedd8bc-e3dd-4d45-8e69-79165a76e4fa',
  rentsafeEval: '4ef82789-e038-44ef-a478-a8f3590c3eb1',
  registration: '2b98b3f3-4f3a-42a4-a4e9-b44d3026595a',
  mls: '5da2e2e8-659e-4850-ae43-47b7f7ad6b62',
} as const

const ENRICHMENT_SLUGS = {
  tchc: 'toronto-community-housing-data',
  /** UNVERIFIED slug historically; resolved via package_search if needed */
  subsidized: 'subsidized-housing-listings',
} as const

function configFromEnv(argv: string[]): PipelineConfig {
  const quick = argv.includes('--quick') || process.env.SIXSCORE_QUICK === '1'
  return {
    quick,
    seniorsSignalEnabled: process.env.SENIORS_SIGNAL_ENABLED === 'true',
    requireOverture: process.env.OVERTURE_REQUIRED === 'true',
    requireFoursquare: process.env.FOURSQUARE_REQUIRED === 'true',
    maxSpineRecords: quick ? 80_000 : null,
  }
}

function ensureSource(doc: BuildingDoc, source: SourceAttribution): void {
  if (!doc.sources.some((s) => s.name === source.name && s.url === source.url)) {
    doc.sources.push(source)
  }
}

function ensureBuilding(
  bag: Map<string, BuildingDoc>,
  spine: AddressSpine,
  addressId: string,
  classificationReason: string,
): BuildingDoc {
  const existing = bag.get(addressId)
  if (existing) {
    if (
      !existing.classification.includes(classificationReason) &&
      classificationReason
    ) {
      existing.classification = `${existing.classification}; ${classificationReason}`
    }
    return existing
  }
  const addr = spine.byId.get(addressId)
  if (!addr) throw new Error(`Missing spine id ${addressId}`)
  const doc: BuildingDoc = {
    id: buildingIdFor(addr),
    slug: buildingSlug(addr),
    address: addr.fullAddress,
    lat: addr.lat,
    lng: addr.lng,
    name: null,
    classification: classificationReason || 'likely apartment/residential multi-unit',
    tier: 3,
    rentSafeScore: null,
    lastInspected: null,
    storeys: null,
    units: null,
    propertyType: null,
    rsn: null,
    categoryScores: {},
    areasEvaluated: null,
    records: [],
    signals: [],
    sources: [{ ...OGL_TORONTO }],
  }
  bag.set(addressId, doc)
  return doc
}

function addRecord(doc: BuildingDoc, record: BuildingRecord): void {
  doc.records.push(record)
}

function addSignal(doc: BuildingDoc, signal: BuildingSignal): void {
  doc.signals.push(signal)
}

function assignTiers(bag: Map<string, BuildingDoc>): void {
  for (const doc of bag.values()) {
    if (doc.rentSafeScore != null) {
      doc.tier = 1
      continue
    }
    const hasSignalOrRecord = doc.records.length > 0 || doc.signals.length > 0
    doc.tier = hasSignalOrRecord ? 2 : 3
  }
}

async function loadSpine(cfg: PipelineConfig): Promise<AddressSpine> {
  console.log('STEP 1 — Address spine (verified)')
  const pkg = await packageShow(VERIFIED.addressPoints)
  const resource = pickDatastoreResource(pkg)
  console.log(`  package=${pkg.name} resource=${resource.id} (${resource.name})`)
  const { records, fields } = await datastoreAll(resource.id, {
    fields:
      'ADDRESS_POINT_ID,LO_NUM,ADDRESS_NUMBER,LINEAR_NAME,LINEAR_NAME_TYPE,LINEAR_NAME_DIR,ADDRESS_FULL,WARD_NAME,geometry',
    maxRecords: cfg.maxSpineRecords,
  })
  requireColumns(
    fields,
    ['ADDRESS_POINT_ID', 'LINEAR_NAME', 'ADDRESS_FULL'],
    'Address Points',
  )
  const spine = new AddressSpine()
  for (const row of records) spine.add(row)
  console.log(`  spine addresses: ${spine.byId.size}`)
  return spine
}

function detectScoreField(fields: string[]): string {
  const preferred = [
    'SCORE',
    'CURRENT BUILDING EVAL SCORE',
    'CURRENT_BUILDING_EVAL_SCORE',
    'PROACTIVE BUILDING SCORE',
  ]
  for (const p of preferred) {
    const hit = fields.find(
      (f) =>
        f.toUpperCase().replace(/[\s_]+/g, '') ===
        p.toUpperCase().replace(/[\s_]+/g, ''),
    )
    if (hit) return hit
  }
  throw new CkanError(
    `UNVERIFIED score column missing. Fields: ${fields.join(', ')}`,
  )
}

function latestByRsn(
  records: Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  const byRsn = new Map<string, Record<string, unknown>>()
  for (const row of records) {
    const rsn = String(getField(row, 'RSN') ?? '').trim()
    if (!rsn) continue
    const date = String(
      getField(row, 'EVALUATION_COMPLETED_ON', 'EVALUATION COMPLETED ON') ?? '',
    )
    const prev = byRsn.get(rsn)
    if (!prev) {
      byRsn.set(rsn, row)
      continue
    }
    const prevDate = String(
      getField(prev, 'EVALUATION_COMPLETED_ON', 'EVALUATION COMPLETED ON') ?? '',
    )
    if (date >= prevDate) byRsn.set(rsn, row)
  }
  return byRsn
}

function applyCategoryFields(
  doc: BuildingDoc,
  row: Record<string, unknown>,
  { preferExisting = false }: { preferExisting?: boolean } = {},
): void {
  const scores = extractCategoryScores(row)
  const areas = extractAreasEvaluated(row)
  if (Object.keys(scores).length > 0) {
    if (preferExisting && doc.categoryScores && Object.keys(doc.categoryScores).length > 0) {
      // Keep richer existing set; fill only missing keys from this row.
      doc.categoryScores = { ...scores, ...doc.categoryScores }
    } else {
      doc.categoryScores = { ...(doc.categoryScores ?? {}), ...scores }
    }
  }
  if (areas != null && (doc.areasEvaluated == null || !preferExisting)) {
    doc.areasEvaluated = areas
  }
}

async function applyRentSafe(
  spine: AddressSpine,
  bag: Map<string, BuildingDoc>,
): Promise<void> {
  console.log('STEP 2 — RentSafeTO evaluation (verified)')
  const pkg = await packageShow(VERIFIED.rentsafeEval)
  // Prefer current evaluations datastore (name contains 2023 / current)
  const resource = pickDatastoreResource(pkg, ['2023', 'current', 'evaluation'])
  console.log(`  resource=${resource.id} (${resource.name})`)
  const { records, fields } = await datastoreAll(resource.id)
  requireColumns(fields, ['RSN'], 'RentSafeTO Evaluation')
  const hasSite = fields.some((f) =>
    ['SITE_ADDRESS', 'SITE ADDRESS'].includes(f.toUpperCase().replace(/_/g, ' ')) ||
    f.toUpperCase().replace(/[\s_]+/g, '') === 'SITEADDRESS',
  )
  if (!hasSite) {
    throw new CkanError(
      `Missing SITE_ADDRESS / SITE ADDRESS on RentSafeTO Evaluation. Have: ${fields.join(', ')}`,
    )
  }
  const scoreField = detectScoreField(fields)
  console.log(`  confirmed score field: ${scoreField}`)

  const byRsn = latestByRsn(records)

  let matched = 0
  for (const row of byRsn.values()) {
    const addr = getField(row, 'SITE_ADDRESS', 'SITE ADDRESS')
    const hit = spine.resolveFreeform(
      addr,
      getField(row, 'LATITUDE'),
      getField(row, 'LONGITUDE'),
    )
    if (!hit) continue
    const score = asNumber(row[scoreField] ?? getField(row, scoreField))
    if (score == null) continue
    const doc = ensureBuilding(bag, spine, hit.addressId, 'RentSafeTO evaluation')
    doc.rentSafeScore = score
    doc.tier = 1
    doc.rsn = String(getField(row, 'RSN') ?? '')
    doc.lastInspected = String(
      getField(row, 'EVALUATION_COMPLETED_ON', 'EVALUATION COMPLETED ON') ?? '',
    ) || null
    doc.storeys = asNumber(
      getField(row, 'CONFIRMED_STOREYS', 'CONFIRMED STOREYS'),
    )
    doc.units = asNumber(getField(row, 'CONFIRMED_UNITS', 'CONFIRMED UNITS'))
    doc.propertyType = String(
      getField(row, 'PROPERTY_TYPE', 'PROPERTY TYPE') ?? '',
    ) || null
    applyCategoryFields(doc, row)
    ensureSource(doc, {
      ...OGL_TORONTO,
      name: 'RentSafeTO Apartment Building Evaluation',
      url: `https://open.toronto.ca/dataset/apartment-building-evaluation/`,
    })
    matched++
  }
  console.log(`  matched evaluations: ${matched}`)

  // Pre-2023 schema carries the canonical CATEGORY_META fields. Join by RSN to
  // fill any categories the current resource does not expose under those names.
  const legacy = pkg.resources?.find(
    (r) =>
      r.datastore_active &&
      /pre-?2023/i.test(`${r.name ?? ''} ${r.description ?? ''}`),
  )
  if (legacy?.id) {
    console.log(`  category enrich from ${legacy.id} (${legacy.name})`)
    const { records: legacyRecords } = await datastoreAll(legacy.id)
    const legacyByRsn = latestByRsn(legacyRecords)
    let enriched = 0
    for (const doc of bag.values()) {
      if (!doc.rsn) continue
      const row = legacyByRsn.get(doc.rsn)
      if (!row) continue
      const before = Object.keys(doc.categoryScores ?? {}).length
      applyCategoryFields(doc, row, { preferExisting: true })
      if (Object.keys(doc.categoryScores ?? {}).length > before) enriched++
      else if (before === 0 && Object.keys(doc.categoryScores ?? {}).length > 0)
        enriched++
    }
    console.log(`  category-enriched buildings: ${enriched}`)
  }
}

async function applyRegistration(
  spine: AddressSpine,
  bag: Map<string, BuildingDoc>,
): Promise<void> {
  console.log('STEP 2b — Apartment Building Registration (verified)')
  const pkg = await packageShow(VERIFIED.registration)
  const resource = pickDatastoreResource(pkg)
  const { records, fields } = await datastoreAll(resource.id)
  requireColumns(fields, ['RSN', 'SITE_ADDRESS'], 'Apartment Registration')
  let matched = 0
  for (const row of records) {
    const hit = spine.resolveFreeform(getField(row, 'SITE_ADDRESS'))
    if (!hit) continue
    const doc = ensureBuilding(
      bag,
      spine,
      hit.addressId,
      'Apartment Building Registration',
    )
    doc.storeys =
      doc.storeys ??
      asNumber(getField(row, 'CONFIRMED_STOREYS', 'NO_OF_STOREYS'))
    doc.units =
      doc.units ?? asNumber(getField(row, 'CONFIRMED_UNITS', 'NO_OF_UNITS'))
    doc.propertyType =
      doc.propertyType ??
      (String(getField(row, 'PROPERTY_TYPE') ?? '') || null)
    doc.rsn = doc.rsn ?? String(getField(row, 'RSN') ?? '')
    addRecord(doc, {
      kind: 'registration',
      title: 'Apartment Building Registration',
      detail: `Registered purpose-built rental${doc.propertyType ? ` (${doc.propertyType})` : ''}`,
      source: 'Apartment Building Registration',
      asOf: String(getField(row, 'DATE_OF_LAST_INSPECTION_BY_TSSA') ?? '') || null,
    })
    ensureSource(doc, {
      ...OGL_TORONTO,
      name: 'Apartment Building Registration',
      url: 'https://open.toronto.ca/dataset/apartment-building-registration/',
    })
    matched++
  }
  console.log(`  matched registrations: ${matched}`)
}

async function applyMls(
  spine: AddressSpine,
  bag: Map<string, BuildingDoc>,
  cfg: PipelineConfig,
): Promise<void> {
  console.log('STEP 2c — MLS Investigation Activity (verified signal)')
  const pkg = await packageShow(VERIFIED.mls)
  const zipRes =
    pkg.resources.find((r) => (r.format ?? '').toUpperCase() === 'ZIP') ??
    pkg.resources[0]
  if (!zipRes?.url) throw new CkanError('MLS zip resource missing url')
  await mkdir(CACHE, { recursive: true })
  const zipPath = path.join(CACHE, 'mls.zip')
  await downloadToFile(zipRes.url, zipPath)

  // Use Python stdlib unzip via shell for reliability without extra deps
  const extractDir = path.join(CACHE, 'mls')
  await rm(extractDir, { recursive: true, force: true })
  await mkdir(extractDir, { recursive: true })
  await execFileAsync('unzip', ['-o', zipPath, '-d', extractDir])

  const files = await readdir(extractDir)
  const addrFile = files.find((f) => f.toLowerCase().includes('address'))
  const invFile = files.find((f) => f.toLowerCase().includes('investigation'))
  const defFile = files.find((f) => f.toLowerCase().includes('deficien'))
  if (!addrFile || !invFile) {
    throw new CkanError('MLS zip missing Addresses/Investigations CSV')
  }

  const { parse } = await import('node:path')
  void parse
  const readCsv = async (file: string) => {
    const text = await readFile(path.join(extractDir, file), 'utf8')
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
    const headers = lines[0]!.split(',').map((h) => h.trim())
    const rows: Record<string, string>[] = []
    // naive CSV — MLS fields rarely embed commas in first columns; use a simple parser
    for (let i = 1; i < lines.length; i++) {
      if (cfg.quick && i > 25000) break
      const cols = splitCsvLine(lines[i]!)
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => {
        row[h] = cols[idx] ?? ''
      })
      rows.push(row)
    }
    return rows
  }

  const addresses = await readCsv(addrFile)
  const investigations = await readCsv(invFile)
  const deficiencies = defFile ? await readCsv(defFile) : []
  const invById = new Map(investigations.map((r) => [r.INVESTIGATION_ID, r]))
  const hazardRe =
    /\b(hazard|hazardous|emergency|unsafe|fire\s*escape|structural|gas\s*leak)\b/i
  const openHazard = new Set<string>()
  for (const d of deficiencies) {
    if ((d.Status ?? '').toLowerCase() === 'open' && hazardRe.test(d.Desc ?? '')) {
      openHazard.add(d.INVESTIGATION_ID)
    }
  }

  let matched = 0
  for (const a of addresses) {
    const key = canonicalKey(a.House, a.Street, a.Type, a.Direction)
    const hit = spine.resolve({
      key: key ?? canonicalFromFreeform(a.AddrLine),
    })
    if (!hit) continue
    const doc = ensureBuilding(bag, spine, hit.addressId, 'MLS investigation activity')
    const inv = invById.get(a.INVESTIGATION_ID)
    addSignal(doc, {
      kind: 'mls_investigation',
      title: 'MLS Investigation Activity',
      detail: inv?.Issue || inv?.InType || 'Investigation',
      source: 'MLS Investigation Activity',
      status: inv?.Status ?? null,
      asOf: inv?.InDate ?? null,
      hazard: openHazard.has(a.INVESTIGATION_ID),
    })
    ensureSource(doc, {
      ...OGL_TORONTO,
      name: 'MLS Investigation Activity',
      url: 'https://open.toronto.ca/dataset/municipal-licensing-and-standards-investigation-activity/',
    })
    matched++
  }
  console.log(`  matched MLS address rows: ${matched}`)
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      inQ = !inQ
      continue
    }
    if (ch === ',' && !inQ) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

async function applyTchc(
  spine: AddressSpine,
  bag: Map<string, BuildingDoc>,
): Promise<void> {
  console.log('STEP 3 — TCHC / subsidized enrichment')
  const tchcPkg = await packageShow(ENRICHMENT_SLUGS.tchc)
  const tchcRes = pickDatastoreResource(tchcPkg)
  const { records: tchcRows, fields: tchcFields } = await datastoreAll(tchcRes.id)
  console.log(`  TCHC fields confirmed: ${tchcFields.slice(0, 12).join(', ')}…`)
  let tchcMatched = 0
  for (const row of tchcRows) {
    const { lat, lng } = (() => {
      const g = row.geometry
      if (typeof g === 'string') {
        try {
          const p = JSON.parse(g) as { coordinates?: number[] }
          return {
            lat: p.coordinates?.[1] ?? null,
            lng: p.coordinates?.[0] ?? null,
          }
        } catch {
          return { lat: null, lng: null }
        }
      }
      return { lat: null, lng: null }
    })()
    const hit = spine.resolve({ lat: asNumber(lat), lng: asNumber(lng) })
    if (!hit) continue
    const doc = ensureBuilding(bag, spine, hit.addressId, 'TCHC portfolio')
    const name = String(getField(row, 'DEV_NAME') ?? '')
    if (name) doc.name = doc.name || name
    doc.units = doc.units ?? asNumber(getField(row, 'TTL_RES_UNIT'))
    addRecord(doc, {
      kind: 'tchc',
      title: 'Toronto Community Housing',
      detail: `${name || 'TCHC building'} · ${getField(row, 'BLD_FORM') ?? ''} · units ${getField(row, 'TTL_RES_UNIT') ?? 'n/a'}`,
      source: 'Toronto Community Housing Data',
    })
    ensureSource(doc, {
      ...OGL_TORONTO,
      name: 'Toronto Community Housing Data',
      url: 'https://open.toronto.ca/dataset/toronto-community-housing-data/',
    })
    tchcMatched++
  }
  console.log(`  TCHC matched: ${tchcMatched}`)

  // Subsidized listings — confirm slug at build time
  let subPkg
  try {
    subPkg = await packageShow(ENRICHMENT_SLUGS.subsidized)
  } catch {
    console.warn(
      '  UNVERIFIED: subsidized-housing-listings package_show failed; skipping',
    )
    return
  }
  const subRes = pickDatastoreResource(subPkg, ['Subsidized Housing'])
  const { records: subRows, fields: subFields } = await datastoreAll(subRes.id)
  requireColumns(
    subFields,
    ['Building Address', 'Building Complex Name', 'Provider Type'],
    'Subsidized Housing Listings',
  )
  let subMatched = 0
  for (const row of subRows) {
    const streetNum = getField(row, 'Building Street Number')
    const street = getField(row, 'Building Address')
    const list = getField(row, 'Building Address List')
    const key =
      canonicalKey(streetNum, street) ?? canonicalFromFreeform(list)
    const hit = spine.resolve({
      key,
      lat: asNumber(getField(row, 'Latitude')),
      lng: asNumber(getField(row, 'Longitude')),
    })
    if (!hit) continue
    const doc = ensureBuilding(
      bag,
      spine,
      hit.addressId,
      'Subsidized housing listing',
    )
    const complex = String(getField(row, 'Building Complex Name') ?? '')
    if (complex) doc.name = doc.name || complex
    addRecord(doc, {
      kind: 'subsidized_housing',
      title: 'Subsidized Housing Listing',
      detail: [
        complex,
        getField(row, 'Provider Type'),
        getField(row, 'Building Type'),
        `Accessible: ${getField(row, 'Wheelchair Accessible Building') ?? 'n/a'}`,
      ]
        .filter(Boolean)
        .join(' · '),
      source: 'Subsidized Housing Listings',
    })
    ensureSource(doc, {
      ...OGL_TORONTO,
      name: 'Subsidized Housing Listings',
      url: 'https://open.toronto.ca/dataset/subsidized-housing-listings/',
    })
    subMatched++
  }
  console.log(`  subsidized matched: ${subMatched}`)
}

async function applyWikidata(
  spine: AddressSpine,
  bag: Map<string, BuildingDoc>,
): Promise<void> {
  console.log('STEP 4c — Wikidata (CC0)')
  const query = `
SELECT ?item ?itemLabel ?address ?coords ?floors ?height ?inception ?units WHERE {
  VALUES ?type { wd:Q13402009 wd:Q18142 wd:Q570116 }
  ?item wdt:P31/wdt:P279* ?type .
  ?item wdt:P131* wd:Q172 .
  OPTIONAL { ?item wdt:P6375 ?address. }
  OPTIONAL { ?item wdt:P625 ?coords. }
  OPTIONAL { ?item wdt:P1101 ?floors. }
  OPTIONAL { ?item wdt:P2048 ?height. }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL { ?item wdt:P13047 ?units. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 500
`.trim()
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'TheSixScoreBuildData/1.0 (civic open data)',
    },
  })
  if (!res.ok) {
    console.warn(`  Wikidata SPARQL failed HTTP ${res.status}; continuing`)
    return
  }
  const json = (await res.json()) as {
    results: { bindings: Record<string, { value: string }>[] }
  }
  let matched = 0
  for (const b of json.results.bindings) {
    const label = b.itemLabel?.value
    const address = b.address?.value
    let lat: number | null = null
    let lng: number | null = null
    if (b.coords?.value?.startsWith('Point(')) {
      const m = b.coords.value.match(/Point\(([-0-9.]+)\s+([-0-9.]+)\)/)
      if (m) {
        lng = Number(m[1])
        lat = Number(m[2])
      }
    }
    const hit = spine.resolve({
      key: canonicalFromFreeform(address),
      lat,
      lng,
    })
    if (!hit) continue
    const doc = ensureBuilding(bag, spine, hit.addressId, 'Wikidata residential entity')
    if (label) doc.name = doc.name || label
    doc.storeys = doc.storeys ?? asNumber(b.floors?.value)
    doc.units = doc.units ?? asNumber(b.units?.value)
    addRecord(doc, {
      kind: 'wikidata',
      title: label || 'Wikidata entity',
      detail: [
        address,
        b.floors?.value ? `${b.floors.value} floors` : null,
        b.height?.value ? `height ${b.height.value}` : null,
        b.inception?.value ? `inception ${b.inception.value.slice(0, 10)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      source: 'Wikidata',
    })
    ensureSource(doc, CC0)
    matched++
  }
  console.log(`  Wikidata matched: ${matched}`)
}

async function applyOverturePlaces(
  spine: AddressSpine,
  bag: Map<string, BuildingDoc>,
  cfg: PipelineConfig,
): Promise<void> {
  console.log('STEP 4a — Overture Places (CDLA-Permissive 2.0)')
  // UNVERIFIED: latest release id confirmed at build time by CLI/default latest
  const outPath = path.join(CACHE, 'overture_places.geojson')
  try {
    await mkdir(CACHE, { recursive: true })
    if (!existsSync(outPath) || cfg.requireOverture) {
      console.log('  running overturemaps CLI (UNVERIFIED release = latest)')
      await execFileAsync(
        'overturemaps',
        [
          'download',
          '--bbox=-79.64,43.58,-79.12,43.86',
          '-f',
          'geojsonseq',
          '--type=place',
          '-o',
          outPath,
        ],
        { maxBuffer: 1024 * 1024 * 64 },
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (cfg.requireOverture) {
      throw new Error(`Overture required but failed: ${msg}`)
    }
    console.warn(`  Overture Places skipped (install overturemaps): ${msg}`)
    return
  }

  if (!existsSync(outPath)) {
    console.warn('  No overture_places output; skipping')
    return
  }

  let matched = 0
  let scanned = 0
  const rl = createInterface({ input: createReadStream(outPath), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    scanned++
    if (cfg.quick && scanned > 50_000) break
    let feat: {
      properties?: Record<string, unknown>
      geometry?: { coordinates?: number[] }
    }
    try {
      feat = JSON.parse(line)
    } catch {
      continue
    }
    const props = feat.properties ?? {}
    const cats = JSON.stringify(props.categories ?? props.category ?? '').toLowerCase()
    const residential =
      cats.includes('apartment') ||
      cats.includes('residential') ||
      cats.includes('condo') ||
      cats.includes('housing')
    if (!residential) continue
    const names = props.names as { primary?: string } | string | undefined
    const name =
      typeof names === 'string'
        ? names
        : names?.primary || String(props.name ?? '')
    const coords = feat.geometry?.coordinates
    const lng = coords?.[0]
    const lat = coords?.[1]
    const addr =
      (props.addresses as { freeform?: string }[] | undefined)?.[0]?.freeform ??
      props.address
    const hit = spine.resolve({
      key: canonicalFromFreeform(addr),
      lat: asNumber(lat),
      lng: asNumber(lng),
    })
    if (!hit) continue
    const doc = ensureBuilding(
      bag,
      spine,
      hit.addressId,
      'Overture Places residential/apartment POI',
    )
    if (name) doc.name = doc.name || name
    addRecord(doc, {
      kind: 'overture_place',
      title: name || 'Overture place',
      detail: `Category signal: ${cats.slice(0, 120)}`,
      source: 'Overture Maps Places',
    })
    ensureSource(doc, CDLA_PERMISSIVE)
    matched++
  }
  console.log(`  Overture Places matched: ${matched} (scanned ${scanned})`)
}

async function applyFoursquare(
  spine: AddressSpine,
  bag: Map<string, BuildingDoc>,
  cfg: PipelineConfig,
): Promise<void> {
  console.log('STEP 4b — Foursquare OS Places (Apache-2.0)')
  // UNVERIFIED: exact HF/Iceberg dump path and filter availability at build time.
  const local = path.join(CACHE, 'foursquare_toronto_apartments.ndjson')
  if (!existsSync(local)) {
    const msg =
      'No local Foursquare extract at .pipeline-cache/foursquare_toronto_apartments.ndjson'
    if (cfg.requireFoursquare) throw new Error(msg)
    console.warn(`  ${msg}; skipping (preserve NOTICE when enabled)`)
    return
  }
  let matched = 0
  const rl = createInterface({ input: createReadStream(local), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    const row = JSON.parse(line) as {
      name?: string
      address?: string
      latitude?: number
      longitude?: number
      category?: string
    }
    const hit = spine.resolve({
      key: canonicalFromFreeform(row.address),
      lat: asNumber(row.latitude),
      lng: asNumber(row.longitude),
    })
    if (!hit) continue
    const doc = ensureBuilding(
      bag,
      spine,
      hit.addressId,
      'Foursquare OS Places residential/apartment POI',
    )
    if (row.name) doc.name = doc.name || row.name
    addRecord(doc, {
      kind: 'foursquare_place',
      title: row.name || 'Foursquare place',
      detail: row.category || 'apartment/residential POI',
      source: 'Foursquare OS Places',
    })
    ensureSource(doc, APACHE_2)
    matched++
  }
  console.log(`  Foursquare matched: ${matched}`)
}

async function optionalOvertureBuildings(cfg: PipelineConfig): Promise<void> {
  console.log('STEP 4d — Overture Buildings footprints (ODbL, SEPARATE FILE ONLY)')
  const outPath = path.join(OUT, 'buildings_footprints.geojson')
  try {
    await execFileAsync(
      'overturemaps',
      [
        'download',
        '--bbox=-79.64,43.58,-79.12,43.86',
        '-f',
        'geojson',
        '--type=building',
        '-o',
        outPath,
      ],
      { maxBuffer: 1024 * 1024 * 64 },
    )
    // Write sidecar note — do NOT merge into buildings.json
    await writeJson(path.join(OUT, 'buildings_footprints.LICENSE.json'), ODBL_NOTE)
    console.log(`  wrote separate ${outPath}`)
  } catch (err) {
    if (cfg.quick) {
      console.warn('  Overture Buildings skipped in quick mode / missing CLI')
      return
    }
    console.warn(
      `  Overture Buildings optional skip: ${err instanceof Error ? err.message : err}`,
    )
  }
}

async function applySeniorsGate(
  _spine: AddressSpine,
  _bag: Map<string, BuildingDoc>,
  cfg: PipelineConfig,
): Promise<void> {
  console.log('STEP 5 — Seniors-housing signal (UNVERIFIED reuse terms)')
  if (!cfg.seniorsSignalEnabled) {
    console.log(
      '  SENIORS_SIGNAL_ENABLED=false — RHRA / Ontario LTC not fetched. Human must confirm ToS before enabling.',
    )
    return
  }
  // UNVERIFIED FOR REUSE: no documented open API/bulk licence.
  throw new Error(
    'SENIORS_SIGNAL_ENABLED=true but RHRA/LTC fetch adapters are not implemented until reuse terms are confirmed.',
  )
}

async function emitLicences(): Promise<void> {
  const dir = path.join(OUT, 'LICENSES')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'CDLA-Permissive-2.0.txt'), CDLA_PERMISSIVE_TEXT)
  await writeFile(
    path.join(dir, 'Foursquare-NOTICE.txt'),
    FOURSQUARE_NOTICE_PLACEHOLDER,
  )
  await writeFile(
    path.join(dir, 'OGL-Toronto.txt'),
    'Contains information licensed under the Open Government Licence – Toronto.\nhttps://open.toronto.ca/open-data-license/\n',
  )
  await writeFile(
    path.join(dir, 'CC0-Wikidata.txt'),
    'Wikidata data is available under CC0 1.0 Universal.\nhttps://www.wikidata.org/wiki/Wikidata:Licensing\n',
  )
}

async function emitBuildings(bag: Map<string, BuildingDoc>): Promise<void> {
  console.log('STEP 7 — Emit static JSON')
  assignTiers(bag)
  const buildings = [...bag.values()].sort((a, b) =>
    a.address.localeCompare(b.address),
  )
  const shardDir = path.join(OUT, 'buildings')
  await rm(shardDir, { recursive: true, force: true })
  await mkdir(shardDir, { recursive: true })

  const index = {
    generatedAt: new Date().toISOString(),
    model: 'three-tier-records-and-signals',
    seniorsSignalEnabled: process.env.SENIORS_SIGNAL_ENABLED === 'true',
    counts: {
      buildings: buildings.length,
      tier1: buildings.filter((b) => b.tier === 1).length,
      tier2: buildings.filter((b) => b.tier === 2).length,
      tier3: buildings.filter((b) => b.tier === 3).length,
    },
    buildings: buildings.map((b) => ({
      id: b.id,
      slug: b.slug,
      address: b.address,
      lat: b.lat,
      lng: b.lng,
      name: b.name ?? null,
      classification: b.classification,
      tier: b.tier,
      rentSafeScore: b.rentSafeScore ?? null,
      lastInspected: b.lastInspected ?? null,
      hazard: b.signals.some((s) => s.hazard),
      categoryScores:
        b.categoryScores && Object.keys(b.categoryScores).length > 0
          ? b.categoryScores
          : undefined,
      areasEvaluated: b.areasEvaluated ?? null,
    })),
  }

  await writeJson(path.join(OUT, 'buildings.json'), index)
  for (const b of buildings) {
    await writeJson(path.join(shardDir, `${b.slug}.json`), b)
  }
  // Compatibility alias for prior UI paths
  await writeJson(path.join(OUT, 'meta.json'), {
    generatedAt: index.generatedAt,
    app: 'TheSixScore',
    model: index.model,
    correctionEmail: 'corrections@thesixscore.example',
    counts: {
      spine: index.counts.buildings,
      evidence: index.counts.buildings,
      tier1: index.counts.tier1,
      tier2: index.counts.tier2,
      tier3SpineAvailable: index.counts.tier3,
    },
    sources: [],
    notes: [
      'buildings.json is the canonical index; shards under /data/buildings/<slug>.json',
      'Overture Buildings (ODbL) kept separate in buildings_footprints.geojson when generated',
      'No tenant-review corpora stored or displayed',
    ],
  })
  console.log(
    `  wrote buildings.json (${buildings.length}) tier1=${index.counts.tier1} tier2=${index.counts.tier2} tier3=${index.counts.tier3}`,
  )
}

async function main(): Promise<void> {
  const cfg = configFromEnv(process.argv.slice(2))
  console.log('TheSixScore build-data', cfg)
  await mkdir(OUT, { recursive: true })
  await mkdir(CACHE, { recursive: true })

  const spine = await loadSpine(cfg)
  const bag = new Map<string, BuildingDoc>()

  await applyRentSafe(spine, bag)
  await applyRegistration(spine, bag)
  await applyMls(spine, bag, cfg)
  await applyTchc(spine, bag)
  await applyWikidata(spine, bag)
  await applyOverturePlaces(spine, bag, cfg)
  await applyFoursquare(spine, bag, cfg)
  await optionalOvertureBuildings(cfg)
  await applySeniorsGate(spine, bag, cfg)
  await emitLicences()
  await emitBuildings(bag)
  console.log('Done.')
}

main().catch((err) => {
  console.error('\nBUILD FAILED LOUDLY')
  console.error(err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
