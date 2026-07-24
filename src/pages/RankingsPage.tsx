import { useEffect, useMemo, useState } from 'react'
import { BuildingListItem } from '../components/BuildingListItem'
import { RequestBuildingForm } from '../components/RequestBuildingForm'
import { ErrorState, PageSkeleton } from '../components/Status'
import { useData } from '../context/DataContext'
import { track } from '../lib/analytics'
import type { Building } from '../types'

type SortKey = 'score' | 'units' | 'yearBuilt'

const PAGE_SIZE = 50

const selectClass =
  'mt-1.5 w-full border border-line bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-accent'

export function RankingsPage() {
  const {
    status,
    error,
    retry,
    buildings,
    wards,
    propertyTypes,
  } = useData()

  const [ward, setWard] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [page, setPage] = useState(1)
  const [showRequestForm, setShowRequestForm] = useState(false)

  useEffect(() => {
    track('rankings_view')
  }, [])

  const filtered = useMemo(() => {
    let list: Building[] = buildings.filter((b) => b.tier === 1 && b.score != null)

    if (ward) {
      list = list.filter((b) => b.wardName === ward || b.ward === ward)
    }
    if (propertyType) {
      list = list.filter((b) => b.propertyType === propertyType)
    }

    const sorted = [...list]
    sorted.sort((a, b) => {
      if (sortKey === 'score') return (b.score ?? 0) - (a.score ?? 0)
      if (sortKey === 'units') {
        return (b.confirmedUnits ?? -1) - (a.confirmedUnits ?? -1)
      }
      return (b.yearBuilt ?? -1) - (a.yearBuilt ?? -1)
    })
    return sorted
  }, [buildings, propertyType, sortKey, ward])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  )

  if (status === 'loading') return <PageSkeleton />
  if (status === 'error') {
    return <ErrorState message={error ?? 'Unknown error'} onRetry={retry} />
  }

  return (
    <div className="fade-up">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Rankings
      </h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted sm:text-base">
        Full leaderboard of scored RentSafeTO buildings. Filter, sort, save, and
        compare without leaving the page.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Ward
          <select
            value={ward}
            onChange={(e) => {
              setWard(e.target.value)
              setPage(1)
            }}
            className={selectClass}
          >
            <option value="">All wards</option>
            {wards.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Property type
          <select
            value={propertyType}
            onChange={(e) => {
              setPropertyType(e.target.value)
              setPage(1)
            }}
            className={selectClass}
          >
            <option value="">All types</option>
            {propertyTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey)
              setPage(1)
            }}
            className={selectClass}
          >
            <option value="score">Score</option>
            <option value="units">Units</option>
            <option value="yearBuilt">Year built</option>
          </select>
        </label>
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        {filtered.length.toLocaleString()} buildings · page {safePage} of{' '}
        {totalPages}
      </p>

      <div className="panel mt-3">
        {pageItems.length ? (
          pageItems.map((b) => (
            <BuildingListItem key={b.rsn} building={b} selectable />
          ))
        ) : (
          <p className="px-3 py-6 text-sm text-ink-muted">
            No scored buildings match these filters.
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="border border-line bg-white px-4 py-2 text-sm font-semibold hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm tabular-nums text-ink-muted">
          {(safePage - 1) * PAGE_SIZE + 1}–
          {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          className="border border-line bg-white px-4 py-2 text-sm font-semibold hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <div className="mt-10 border-t border-line pt-8">
        {!showRequestForm ? (
          <button
            type="button"
            onClick={() => setShowRequestForm(true)}
            className="text-sm font-semibold text-accent underline-offset-2 hover:underline"
          >
            Request a building
          </button>
        ) : (
          <RequestBuildingForm id="request-building" />
        )}
      </div>
    </div>
  )
}
