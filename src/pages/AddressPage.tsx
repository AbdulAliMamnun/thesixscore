import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { BuildingDetail } from '../components/BuildingDetail'
import { ErrorState, PageSkeleton } from '../components/Status'
import { useData } from '../context/DataContext'
import { hydrateBuildingDetail } from '../lib/data'
import type { Building } from '../types'

export function AddressPage() {
  const { id } = useParams<{ id: string }>()
  const { status, error, retry, scoredBuildings, bySlug, byAddressId, byRsn } =
    useData()
  const [building, setBuilding] = useState<Building | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (status !== 'ready' || !id) return
      setLoadingDetail(true)
      const dataset = {
        buildings: [],
        scoredBuildings,
        byRsn,
        byAddressId,
        bySlug,
        meta: {
          packageName: '',
          resourceId: '',
          totalRawRecords: 0,
          schemaVariant: 'static-buildings' as const,
          mode: 'static-coverage' as const,
          scoresUnavailable: false,
        },
      }
      const full = await hydrateBuildingDetail(id, dataset)
      if (!cancelled) {
        setBuilding(full)
        setLoadingDetail(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [status, id, byAddressId, byRsn, bySlug, scoredBuildings])

  if (status === 'loading' || loadingDetail) return <PageSkeleton />
  if (status === 'error') {
    return <ErrorState message={error ?? 'Unknown error'} onRetry={retry} />
  }
  if (!building) {
    return (
      <div className="panel px-6 py-8">
        <h2 className="font-display text-2xl font-semibold">Building not found</h2>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold text-accent">
          Back to search
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Link
        to="/"
        className="mb-4 inline-flex text-sm font-medium text-ink-muted no-underline hover:text-accent"
      >
        ← Back to search
      </Link>
      <BuildingDetail building={building} scoredBuildings={scoredBuildings} />
    </div>
  )
}
