import { docToBuilding, loadBuildingShard, loadBuildingsIndex } from './buildings'
import type { Building, DatasetMeta, LoadedDataset } from '../types'

let cachedDataset: LoadedDataset | null = null
let inflight: Promise<LoadedDataset> | null = null

async function loadDatasetFresh(): Promise<LoadedDataset> {
  const index = await loadBuildingsIndex()

  // Hydrate list views from index; full shards load on detail pages.
  const buildings: Building[] = []
  const byRsn = new Map<string, Building>()
  const byAddressId = new Map<string, Building>()
  const bySlug = new Map<string, Building>()

  for (const row of index.buildings) {
    const building = docToBuilding({
      id: row.id,
      slug: row.slug,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      name: row.name,
      classification: row.classification,
      tier: row.tier,
      rentSafeScore: row.rentSafeScore,
      lastInspected: row.lastInspected,
      records: [],
      signals: row.hazard
        ? [
            {
              kind: 'hazard_flag',
              title: 'Hazard signal',
              detail: 'Open hazardous order/deficiency present in source data',
              source: 'MLS Investigation Activity',
              hazard: true,
            },
          ]
        : [],
      sources: [],
    })
    buildings.push(building)
    byRsn.set(building.rsn, building)
    byAddressId.set(row.id, building)
    bySlug.set(row.slug, building)
  }

  buildings.sort((a, b) => a.siteAddress.localeCompare(b.siteAddress))
  const scoredBuildings = buildings
    .filter((b) => b.tier === 1 && b.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  const meta: DatasetMeta = {
    packageName: 'TheSixScore buildings.json',
    resourceId: 'static:/data/buildings.json',
    totalRawRecords: index.counts.buildings,
    schemaVariant: 'static-buildings',
    mode: 'static-coverage',
    scoresUnavailable: scoredBuildings.length === 0,
    generatedAt: index.generatedAt,
    correctionEmail: 'corrections@thesixscore.example',
  }

  console.log('[TheSixScore] Loaded static buildings.json', index.counts)

  return { buildings, byRsn, byAddressId, bySlug, scoredBuildings, meta }
}

export function getCachedDataset(): LoadedDataset | null {
  return cachedDataset
}

export function loadDataset(force = false): Promise<LoadedDataset> {
  if (!force && cachedDataset) return Promise.resolve(cachedDataset)
  if (!force && inflight) return inflight
  inflight = loadDatasetFresh()
    .then((d) => {
      cachedDataset = d
      inflight = null
      return d
    })
    .catch((err) => {
      inflight = null
      throw err
    })
  return inflight
}

export function clearDatasetCache(): void {
  cachedDataset = null
  inflight = null
}

export async function hydrateBuildingDetail(
  slugOrId: string,
  dataset: LoadedDataset,
): Promise<Building | null> {
  const fromIndex =
    dataset.bySlug.get(slugOrId) ||
    dataset.byAddressId.get(slugOrId) ||
    dataset.byRsn.get(slugOrId)
  if (!fromIndex) return null
  const slug = fromIndex.slug
  if (!slug) return fromIndex
  const full = await loadBuildingShard(slug)
  if (!full) return fromIndex
  return docToBuilding(full)
}
