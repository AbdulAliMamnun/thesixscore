import type { Building, BuildingDoc, BuildingsIndex, ColourBand, LetterGrade } from '../types'
import { colourFromScore, letterGradeFromScore } from './normalize'

function enrich(doc: BuildingDoc): BuildingDoc {
  if (doc.tier === 1 && doc.rentSafeScore != null) {
    return {
      ...doc,
      colourBand: colourFromScore(doc.rentSafeScore),
      letterGrade: letterGradeFromScore(doc.rentSafeScore),
    }
  }
  return { ...doc, colourBand: null, letterGrade: null }
}

export function docToBuilding(doc: BuildingDoc): Building {
  const e = enrich(doc)
  return {
    rsn: e.rsn || e.id,
    siteAddress: e.address,
    ward: null,
    wardName: null,
    propertyType: e.propertyType ?? null,
    yearBuilt: null,
    confirmedStoreys: e.storeys ?? null,
    confirmedUnits: e.units ?? null,
    yearEvaluated: null,
    evaluationCompletedOn: e.lastInspected ?? null,
    latitude: e.lat,
    longitude: e.lng,
    score: e.tier === 1 ? e.rentSafeScore ?? null : null,
    resultsOfScore: null,
    colourBand: (e.colourBand as ColourBand | null) ?? null,
    colourFromField: false,
    letterGrade: (e.letterGrade as LetterGrade | null) ?? null,
    gradeDerivedFromColour: false,
    subScores: [],
    raw: e as unknown as Record<string, unknown>,
    addressPointId: e.id,
    slug: e.slug,
    name: e.name ?? null,
    tier: e.tier,
    classification: e.classification,
    records: e.records,
    signals: e.signals,
    sources: e.sources,
    hazardFlag: e.signals.some((s) => s.hazard),
  }
}

export async function loadBuildingsIndex(): Promise<BuildingsIndex> {
  const res = await fetch('/data/buildings.json')
  if (!res.ok) {
    throw new Error(
      'Missing /data/buildings.json. Run `npm run data:build` (build-time pipeline). No runtime third-party fetches are used.',
    )
  }
  return (await res.json()) as BuildingsIndex
}

export async function loadBuildingShard(slug: string): Promise<BuildingDoc | null> {
  const res = await fetch(`/data/buildings/${encodeURIComponent(slug)}.json`)
  if (!res.ok) return null
  return enrich(await res.json())
}

export const TENANT_REVIEW_LINK_OUT =
  'https://www.toronto.ca/community-people/housing-shelter/rental-housing-tenant-rights/'

export const TIER_COPY = {
  tier1: (score: number, date: string | null) =>
    `RentSafeTO score: ${score}/100 — City of Toronto apartment building inspection result. Source: City of Toronto Open Data, last inspected ${date ?? 'date unavailable'}.`,
  tier2:
    'No official City inspection score applies to this building. Below is its public record — registration details and any open complaints or investigations. The absence of records is not proof of quality.',
  tier3:
    'Limited data. We can confirm this address exists as a residential building but have few public records for it. This is not a rating.',
  footer:
    'TheSixScore displays public records and official inspection results. It does not host tenant reviews. For resident experiences, see tenant rights resources (link-out only — no Yelp/Google/Reddit/review-site content is stored or displayed).',
} as const
