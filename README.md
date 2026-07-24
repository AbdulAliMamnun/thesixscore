# TheSixScore

Static Vite + React + TypeScript site. **All third-party data is fetched at build time** and committed under `public/data/`. The browser never calls CKAN/Overture/Wikidata/etc. at runtime.

## Display model

| Tier | Meaning |
| --- | --- |
| **1** | Official RentSafeTO score (`score/100`) |
| **2** | Public records / signals only — **no fabricated grade** |
| **3** | Limited Data — not a rating, never coloured green |

Exact UI copy is enforced in `src/lib/buildings.ts` (`TIER_COPY`).

## Environment variables

Copy `.env.example` to `.env` if you want local analytics / form capture. Both variables are **optional**.

| Variable | Purpose |
| --- | --- |
| `VITE_FORMSPREE_ENDPOINT` | Formspree form URL for missed-query logs, building requests, and feedback |
| `VITE_PLAUSIBLE_DOMAIN` | Plausible site domain (injects the Plausible script at build time) |

If either is unset, related code **silently no-ops**: no script tag, no network calls, no errors. Local `npm run dev` / `npm run build` work without them.

## Missed queries & coverage expansion

When search returns zero results, the query is debounced (800ms) and POSTed to Formspree as `{ type: 'missed_query', ... }` (once per query per session). Those logs are the **primary input for prioritizing coverage expansion**. Building requests and thumbs-down feedback also go to Formspree only — never to Plausible.

## Third-party reviews

TheSixScore **never fetches, embeds, scrapes, caches, or stores** third-party review content (Reddit, Google Maps, Openroom, Rate The Landlord, etc.). Empty-search research links are outbound only. No synthetic rating is computed for buildings without an official RentSafeTO score.

## Local development

```bash
npm i
npm run data:build:quick   # or: npm run data:build
npm run dev
```

## Data pipeline

`tsx scripts/build-data.ts` (also `npm run data:build`):

1. Address Points spine (verified CKAN id `abedd8bc-…`)
2. RentSafeTO Evaluation + Registration + MLS (verified ids) — score column confirmed at build time
3. TCHC + Subsidized Housing enrichment
4. Overture Places (CDLA) / Foursquare OS Places (Apache-2.0) / Wikidata (CC0) when available
5. Seniors RHRA/LTC **gated** (`SENIORS_SIGNAL_ENABLED=false` by default — UNVERIFIED reuse)
6. Emits `public/data/buildings.json` + `public/data/buildings/<slug>.json`
7. Overture Buildings footprints (ODbL) written **separately** to `buildings_footprints.geojson` only
8. Licence texts in `public/data/LICENSES/`

## GitHub Action

`.github/workflows/build-data.yml` — weekly + manual. Commits refreshed `public/data/**` (triggers Vercel).

## Hard rules

- Never invent a numeric rating for non-RentSafeTO buildings
- Never store/display Yelp/Google/Reddit/openroom/RateTheLandlord content (link-out only)
- Keep ODbL footprints physically separate from the redistributed derivative DB
- Fail loudly if verified CKAN `package_show` 404s or confirmed columns are missing
- No backend, serverless functions, or proxies on Vercel — static only
