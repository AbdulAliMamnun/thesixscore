import { Link } from 'react-router-dom'
import { useMemo, type ReactNode } from 'react'
import { ErrorState, PageSkeleton } from '../components/Status'
import { useData } from '../context/DataContext'
import { usePreferences } from '../context/PreferencesContext'
import { colourBadgeLabel, formatWard, percentileProse } from '../lib/normalize'
import { colourBandClasses, gradeInkClass } from '../lib/ui'
import type { Building } from '../types'

export function ComparePage() {
  const { status, error, retry, byRsn, byAddressId, scoredBuildings } = useData()
  const { compare, toggleCompareId, clearCompareList } = usePreferences()

  const buildings = useMemo(
    () =>
      compare
        .map((id) => byAddressId.get(id) || byRsn.get(id))
        .filter((b): b is Building => Boolean(b)),
    [byAddressId, byRsn, compare],
  )

  if (status === 'loading') return <PageSkeleton />
  if (status === 'error') {
    return <ErrorState message={error ?? 'Unknown error'} onRetry={retry} />
  }

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Compare buildings
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Select up to three buildings from search or rankings, then review scores
            side by side.
          </p>
        </div>
        {buildings.length > 0 && (
          <button
            type="button"
            onClick={clearCompareList}
            className="border border-line px-3 py-2 text-sm font-semibold hover:border-ink"
          >
            Clear all
          </button>
        )}
      </div>

      {buildings.length === 0 ? (
        <div className="panel mt-8 px-5 py-8">
          <p className="font-semibold text-ink">No buildings selected yet.</p>
          <p className="mt-2 text-sm text-ink-muted">
            Use the Compare action on any building list, or open a building and
            choose “Add to compare”.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-accent"
          >
            Find buildings
          </Link>
        </div>
      ) : (
        <div
          className={`mt-8 grid gap-4 ${
            buildings.length === 1
              ? 'sm:grid-cols-1'
              : buildings.length === 2
                ? 'md:grid-cols-2'
                : 'lg:grid-cols-3'
          }`}
        >
          {buildings.map((building) => (
            <CompareColumn
              key={building.rsn}
              building={building}
              scoredBuildings={scoredBuildings}
              onRemove={() => toggleCompareId(building.rsn)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CompareColumn({
  building,
  scoredBuildings,
  onRemove,
}: {
  building: Building
  scoredBuildings: Building[]
  onRemove: () => void
}) {
  const standing = percentileProse(building, scoredBuildings)

  return (
    <section className="panel flex flex-col">
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={
              building.addressPointId
                ? `/address/${building.addressPointId}`
                : `/building/${building.rsn}`
            }
            className="font-display text-lg font-semibold leading-snug text-ink no-underline hover:text-accent"
          >
            {building.siteAddress}
          </Link>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 text-xs font-semibold text-ink-muted hover:text-shame"
          >
            Remove
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-muted">{formatWard(building)}</p>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
        <Metric
          label="Tier"
          value={<span className="font-semibold">Tier {building.tier ?? '—'}</span>}
        />
        <Metric
          label="Grade"
          value={
            building.tier === 1 && building.letterGrade ? (
              <span className={`grade-mark text-4xl ${gradeInkClass(building.letterGrade)}`}>
                {building.letterGrade}
              </span>
            ) : (
              <span className="text-sm text-ink-muted">No letter grade</span>
            )
          }
        />
        <Metric
          label="Score"
          value={
            <span className="font-display text-3xl font-semibold tabular-nums">
              {building.score ?? '—'}
            </span>
          }
        />
        <Metric
          label="Band"
          value={
            <span
              className={`inline-block border px-2 py-1 text-[10px] font-semibold uppercase ${colourBandClasses(building.colourBand)}`}
            >
              {colourBadgeLabel(building.colourBand)}
            </span>
          }
        />
        <Metric
          label="Standing"
          value={
            <span className="text-sm font-semibold leading-snug">
              {standing ?? '—'}
            </span>
          }
        />
      </div>

      <dl className="grow space-y-3 px-4 py-4 text-sm">
        <Row label="Units" value={building.confirmedUnits} />
        <Row label="Storeys" value={building.confirmedStoreys} />
        <Row label="Year built" value={building.yearBuilt} />
        <Row label="Type" value={building.propertyType} />
        <Row
          label="Evaluated"
          value={
            building.evaluationCompletedOn ??
            building.yearEvaluated ??
            '—'
          }
        />
      </dl>

      <div className="border-t border-line px-4 py-3">
        <Link
          to={
            building.addressPointId
              ? `/address/${building.addressPointId}`
              : `/building/${building.rsn}`
          }
          className="text-sm font-semibold text-accent no-underline hover:underline"
        >
          Open full evaluation →
        </Link>
      </div>
    </section>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="mt-1">{value}</div>
    </div>
  )
}

function Row({
  label,
  value,
}: {
  label: string
  value: string | number | null | undefined
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold text-right">{value ?? '—'}</dd>
    </div>
  )
}
