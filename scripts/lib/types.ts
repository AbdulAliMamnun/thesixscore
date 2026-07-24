/**
 * Shared types for TheSixScore build-time pipeline.
 * UNVERIFIED items are labelled in comments at call sites.
 */

export type DisplayTier = 1 | 2 | 3

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
  tier: DisplayTier
  rentSafeScore?: number | null
  lastInspected?: string | null
  storeys?: number | null
  units?: number | null
  propertyType?: string | null
  rsn?: string | null
  records: BuildingRecord[]
  signals: BuildingSignal[]
  sources: SourceAttribution[]
}

export interface SpineAddress {
  addressId: string
  streetNumber: string
  streetName: string
  unit?: string | null
  lat: number | null
  lng: number | null
  fullAddress: string
  canonicalKey: string
  ward?: string | null
}

export interface PipelineConfig {
  quick: boolean
  seniorsSignalEnabled: boolean
  requireOverture: boolean
  requireFoursquare: boolean
  maxSpineRecords: number | null
}
