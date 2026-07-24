export type ColourBand = 'green' | 'yellow' | 'red'
export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F'
export type EvidenceTier = 1 | 2 | 3

export interface SourceAttribution {
  name: string
  licence: string
  attribution: string
  url: string
}

export interface BuildingRecord {
  kind: string
  title: string
  detail: string
  source: string
  asOf?: string | null
}

export interface BuildingSignal {
  kind: string
  title: string
  detail: string
  source: string
  status?: string | null
  asOf?: string | null
  hazard?: boolean
}

export interface BuildingDoc {
  id: string
  slug: string
  address: string
  lat: number | null
  lng: number | null
  name?: string | null
  classification: string
  tier: EvidenceTier
  rentSafeScore?: number | null
  lastInspected?: string | null
  storeys?: number | null
  units?: number | null
  propertyType?: string | null
  rsn?: string | null
  records: BuildingRecord[]
  signals: BuildingSignal[]
  sources: SourceAttribution[]
  letterGrade?: LetterGrade | null
  colourBand?: ColourBand | null
}

export interface BuildingsIndex {
  generatedAt: string
  model: string
  seniorsSignalEnabled: boolean
  counts: {
    buildings: number
    tier1: number
    tier2: number
    tier3: number
  }
  buildings: Array<{
    id: string
    slug: string
    address: string
    lat: number | null
    lng: number | null
    name: string | null
    classification: string
    tier: EvidenceTier
    rentSafeScore: number | null
    lastInspected: string | null
    hazard: boolean
  }>
}

/** UI-facing alias used across list/detail components */
export type Building = {
  rsn: string
  siteAddress: string
  ward: string | null
  wardName: string | null
  propertyType: string | null
  yearBuilt: number | null
  confirmedStoreys: number | null
  confirmedUnits: number | null
  yearEvaluated: number | null
  evaluationCompletedOn: string | null
  latitude: number | null
  longitude: number | null
  score: number | null
  resultsOfScore: string | null
  colourBand: ColourBand | null
  colourFromField: boolean
  letterGrade: LetterGrade | null
  gradeDerivedFromColour: boolean
  subScores: { key: string; label: string; value: number; max: number }[]
  raw: Record<string, unknown>
  addressPointId?: string
  slug?: string
  name?: string | null
  tier?: EvidenceTier
  classification?: string
  records?: BuildingRecord[]
  signals?: BuildingSignal[]
  sources?: SourceAttribution[]
  hazardFlag?: boolean
}

export interface DatasetMeta {
  packageName: string
  resourceId: string
  totalRawRecords: number
  schemaVariant: 'static-buildings'
  mode: 'static-coverage'
  scoresUnavailable: boolean
  generatedAt?: string
  correctionEmail?: string
}

export interface LoadedDataset {
  buildings: Building[]
  byRsn: Map<string, Building>
  byAddressId: Map<string, Building>
  bySlug: Map<string, Building>
  scoredBuildings: Building[]
  meta: DatasetMeta
}
