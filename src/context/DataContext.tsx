import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { clearDatasetCache, loadDataset } from '../lib/data'
import type { Building, DatasetMeta, LoadedDataset } from '../types'

interface DataContextValue {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  buildings: Building[]
  scoredBuildings: Building[]
  byRsn: Map<string, Building>
  byAddressId: Map<string, Building>
  bySlug: Map<string, Building>
  meta: DatasetMeta | null
  hallOfShame: Building[]
  honourRoll: Building[]
  wards: string[]
  propertyTypes: string[]
  retry: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [dataset, setDataset] = useState<LoadedDataset | null>(null)

  const load = useCallback(async (force = false) => {
    setStatus('loading')
    setError(null)
    try {
      if (force) clearDatasetCache()
      const next = await loadDataset(force)
      setDataset(next)
      setStatus('ready')
    } catch (err) {
      setDataset(null)
      setStatus('error')
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong loading static buildings data.',
      )
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  const value = useMemo<DataContextValue>(() => {
    const buildings = dataset?.buildings ?? []
    const scoredBuildings = dataset?.scoredBuildings ?? []
    const hallOfShame = [...scoredBuildings]
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .slice(0, 10)
    const honourRoll = scoredBuildings.slice(0, 10)

    const wardSet = new Set<string>()
    const typeSet = new Set<string>()
    for (const b of buildings) {
      if (b.wardName) wardSet.add(b.wardName)
      else if (b.ward) wardSet.add(b.ward)
      if (b.propertyType) typeSet.add(b.propertyType)
    }

    return {
      status,
      error,
      buildings,
      scoredBuildings,
      byRsn: dataset?.byRsn ?? new Map(),
      byAddressId: dataset?.byAddressId ?? new Map(),
      bySlug: dataset?.bySlug ?? new Map(),
      meta: dataset?.meta ?? null,
      hallOfShame,
      honourRoll,
      wards: Array.from(wardSet).sort((a, b) => a.localeCompare(b)),
      propertyTypes: Array.from(typeSet).sort((a, b) => a.localeCompare(b)),
      retry: () => void load(true),
    }
  }, [dataset, error, load, status])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
