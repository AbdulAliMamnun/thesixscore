import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BuildingListItem } from '../components/BuildingListItem'
import { NotFoundPanel } from '../components/NotFoundPanel'
import { ErrorState, PageSkeleton } from '../components/Status'
import { useData } from '../context/DataContext'
import { usePreferences } from '../context/PreferencesContext'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { logMissedQuery, track } from '../lib/analytics'
import { searchBuildings } from '../lib/search'
import type { Building, ColourBand } from '../types'

type BandFilter = ColourBand | 'all'

export function HomePage() {
  const {
    status,
    error,
    retry,
    buildings,
    scoredBuildings,
    hallOfShame,
    honourRoll,
    meta,
    byRsn,
    byAddressId,
  } = useData()
  const { recent } = usePreferences()
  const [query, setQuery] = useState('')
  const [band, setBand] = useState<BandFilter>('all')
  const debouncedQuery = useDebouncedValue(query, 220)

  const results = useMemo(
    () => searchBuildings(buildings, debouncedQuery, 15),
    [buildings, debouncedQuery],
  )

  const trimmedQuery = debouncedQuery.trim()
  const showEmpty = trimmedQuery.length > 0 && results.length === 0
  const showResults = trimmedQuery.length > 0 && results.length > 0

  // Debounce empty searches 800ms so partial typing isn't logged.
  const missedCandidate = useDebouncedValue(showEmpty ? trimmedQuery : '', 800)

  useEffect(() => {
    if (!missedCandidate) return
    logMissedQuery(missedCandidate)
  }, [missedCandidate])

  useEffect(() => {
    if (!trimmedQuery || results.length === 0) return
    track('search_hit', { resultCount: results.length })
  }, [trimmedQuery, results])

  const bandCounts = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0 }
    for (const b of scoredBuildings) {
      if (b.colourBand) counts[b.colourBand] += 1
    }
    return counts
  }, [scoredBuildings])

  const bandBuildings = useMemo(() => {
    if (band === 'all') return null
    return scoredBuildings
      .filter((b) => b.colourBand === band)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 12)
  }, [band, scoredBuildings])

  const recentBuildings = useMemo(
    () =>
      recent
        .map((id) => byAddressId.get(id) || byRsn.get(id))
        .filter((b): b is Building => Boolean(b)),
    [byAddressId, byRsn, recent],
  )

  if (status === 'loading') return <PageSkeleton />
  if (status === 'error') {
    return <ErrorState message={error ?? 'Unknown error'} onRetry={retry} />
  }

  return (
    <div className="fade-up">
      <section className="border-b border-line pb-10">
        <p className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          TheSixScore
        </p>
        <h1 className="mt-4 max-w-2xl text-xl leading-snug sm:text-2xl">
          Official RentSafeTO scores where they exist — public records and signals
          everywhere else. Never a fabricated rating.
        </h1>
        <p className="mt-3 max-w-xl text-sm text-ink-muted">
          Data is joined at build time from City of Toronto Open Data and redistributable
          enrichment sources. No runtime third-party API calls.
        </p>

        <div className="mt-8 max-w-2xl">
          <label
            htmlFor="address-search"
            className="text-xs font-semibold uppercase tracking-wider text-ink-muted"
          >
            Find a building
          </label>
          <input
            id="address-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Street number and name"
            className="mt-2 w-full border border-line bg-white px-4 py-3.5 text-base outline-none focus:border-accent"
          />
          {showResults && (
            <div className="panel mt-2">
              {results.map((b) => (
                <BuildingListItem
                  key={b.addressPointId || b.rsn}
                  building={b}
                  selectable
                />
              ))}
            </div>
          )}
          {showEmpty && <NotFoundPanel query={trimmedQuery} />}
        </div>

        <p className="mt-4 text-xs text-ink-muted">
          {buildings.length.toLocaleString()} classified buildings
          {meta?.generatedAt ? ` · generated ${meta.generatedAt}` : ''}
        </p>
        <p className="mt-2 text-sm">
          <Link to="/scoring" className="font-semibold text-accent no-underline hover:underline">
            Methodology, licences & corrections →
          </Link>
        </p>
      </section>

      <section className="py-10">
        <h2 className="font-display text-2xl font-semibold">RentSafeTO colour bands</h2>
        <p className="mt-1 text-sm text-ink-muted">Tier 1 only — official City scores.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {(
            [
              ['all', 'All scored', scoredBuildings.length],
              ['green', 'Green 85–100', bandCounts.green],
              ['yellow', 'Yellow 70–84', bandCounts.yellow],
              ['red', 'Red 0–69', bandCounts.red],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setBand(key === 'all' ? 'all' : key)}
              className={`border px-4 py-3 text-left ${
                band === key ? 'border-ink bg-ink text-white' : 'border-line bg-white'
              }`}
            >
              <div className="text-sm font-semibold">{label}</div>
              <div className={`mt-1 text-xs ${band === key ? 'text-white/70' : 'text-ink-muted'}`}>
                {count.toLocaleString()}
              </div>
            </button>
          ))}
        </div>
        {bandBuildings && (
          <div className="panel mt-4">
            {bandBuildings.map((b) => (
              <BuildingListItem
                key={b.addressPointId || b.rsn}
                building={b}
                selectable
                emphasizeShame={band === 'red'}
              />
            ))}
          </div>
        )}
      </section>

      {recentBuildings.length > 0 && (
        <section className="border-t border-line py-10">
          <h2 className="font-display text-2xl font-semibold">Recently viewed</h2>
          <div className="panel mt-4">
            {recentBuildings.map((b) => (
              <BuildingListItem key={b.addressPointId || b.rsn} building={b} selectable />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-8 border-t border-line py-10 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-2xl font-semibold text-shame">
            Lowest Tier 1 scores
          </h2>
          <div className="panel mt-4">
            {hallOfShame.map((b) => (
              <BuildingListItem
                key={b.addressPointId || b.rsn}
                building={b}
                emphasizeShame
                selectable
              />
            ))}
          </div>
        </section>
        <section>
          <h2 className="font-display text-2xl font-semibold">Highest Tier 1 scores</h2>
          <div className="panel mt-4">
            {honourRoll.map((b) => (
              <BuildingListItem key={b.addressPointId || b.rsn} building={b} selectable />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
