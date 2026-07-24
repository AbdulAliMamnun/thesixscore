import { Link, useParams } from 'react-router-dom'
import { BuildingDetail } from '../components/BuildingDetail'
import { ErrorState, PageSkeleton } from '../components/Status'
import { useData } from '../context/DataContext'

export function BuildingPage() {
  const { id } = useParams<{ id: string }>()
  const { status, error, retry, byRsn, scoredBuildings } = useData()

  if (status === 'loading') return <PageSkeleton />
  if (status === 'error') {
    return <ErrorState message={error ?? 'Unknown error'} onRetry={retry} />
  }

  const building = id ? byRsn.get(id) : undefined

  if (!building) {
    return (
      <div className="panel fade-up px-6 py-8">
        <h2 className="font-display text-2xl font-semibold">Building not found</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
          No RentSafeTO record matches RSN{' '}
          <span className="font-semibold text-ink">{id}</span>. RentSafeTO only
          covers registered purpose-built rentals with 3 or more storeys and 10
          or more units — not condos, houses, townhomes, or small buildings.
          TheSixScore never fabricates a grade.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-accent"
        >
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
