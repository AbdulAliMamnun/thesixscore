import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { BuildingListItem } from '../components/BuildingListItem'
import { ErrorState, PageSkeleton } from '../components/Status'
import { useData } from '../context/DataContext'
import { usePreferences } from '../context/PreferencesContext'
import type { Building } from '../types'

export function SavedPage() {
  const { status, error, retry, byRsn, byAddressId } = useData()
  const { favorites } = usePreferences()

  const buildings = useMemo(
    () =>
      favorites
        .map((id) => byAddressId.get(id) || byRsn.get(id))
        .filter((b): b is Building => Boolean(b)),
    [byAddressId, byRsn, favorites],
  )

  if (status === 'loading') return <PageSkeleton />
  if (status === 'error') {
    return <ErrorState message={error ?? 'Unknown error'} onRetry={retry} />
  }

  return (
    <div className="fade-up">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Saved buildings
      </h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        Buildings you save stay on this device. Use them to revisit evaluations or
        add quickly to a compare set.
      </p>

      {buildings.length === 0 ? (
        <div className="panel mt-8 px-5 py-8">
          <p className="font-semibold text-ink">Nothing saved yet.</p>
          <p className="mt-2 text-sm text-ink-muted">
            Open any building and choose “Save building”, or use Save on a list
            row.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-accent"
          >
            Search buildings
          </Link>
        </div>
      ) : (
        <div className="panel mt-8">
          {buildings.map((b) => (
            <BuildingListItem key={b.rsn} building={b} selectable />
          ))}
        </div>
      )}
    </div>
  )
}
