import { useEffect, useState } from 'react'
import type { Building } from '../types'
import { colourBadgeLabel, formatWard, percentileRank } from '../lib/normalize'
import { gradeInkClass, colourBandClasses, shareBuilding } from '../lib/ui'
import { usePreferences } from '../context/PreferencesContext'
import { TENANT_REVIEW_LINK_OUT, TIER_COPY } from '../lib/buildings'
import { track } from '../lib/analytics'
import { UsefulVote } from './UsefulVote'

export function BuildingDetail({
  building,
  scoredBuildings,
}: {
  building: Building
  scoredBuildings: Building[]
}) {
  const {
    isFavorite,
    inCompare,
    toggleFavoriteId,
    toggleCompareId,
    recordVisit,
  } = usePreferences()
  const [shareNote, setShareNote] = useState<string | null>(null)
  const id = building.addressPointId || building.rsn
  const tier = building.tier ?? (building.score != null ? 1 : 3)

  useEffect(() => {
    recordVisit(id)
  }, [id, recordVisit])

  useEffect(() => {
    track('report_card_view', {
      grade: building.letterGrade ?? 'none',
      ward: building.wardName ?? building.ward ?? 'unknown',
    })
  }, [building.letterGrade, building.wardName, building.ward, id])

  const percentile = percentileRank(building, scoredBuildings)

  async function onShare() {
    setShareNote(null)
    const url = window.location.href
    const text =
      tier === 1 && building.score != null
        ? `TheSixScore: ${building.siteAddress} — RentSafeTO ${building.score}/100`
        : `TheSixScore: ${building.siteAddress} — Tier ${tier} public records profile`
    try {
      const result = await shareBuilding({
        title: `TheSixScore — ${building.siteAddress}`,
        text,
        url,
      })
      track('share_click', {
        method: result === 'shared' ? 'webshare' : 'clipboard',
      })
      if (result === 'copied') setShareNote('Link copied to clipboard')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(url)
        track('share_click', { method: 'clipboard' })
        setShareNote('Link copied to clipboard')
      } catch {
        setShareNote('Sharing unavailable in this browser')
      }
    }
  }

  return (
    <article className="panel fade-up overflow-hidden">
      <header className="border-b border-line px-5 py-6 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          Tier {tier}
          {building.name ? ` · ${building.name}` : ''}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {building.siteAddress}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{formatWard(building)}</p>
        {building.classification && (
          <p className="mt-2 text-xs text-ink-muted">
            Classification: {building.classification}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toggleFavoriteId(id)}
            className={`border px-3 py-2 text-sm font-semibold ${
              isFavorite(id)
                ? 'border-accent bg-accent text-white'
                : 'border-line bg-white'
            }`}
          >
            {isFavorite(id) ? 'Saved' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => toggleCompareId(id)}
            className={`border px-3 py-2 text-sm font-semibold ${
              inCompare(id)
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line bg-white'
            }`}
          >
            {inCompare(id) ? 'In compare set' : 'Compare'}
          </button>
          <button
            type="button"
            onClick={() => void onShare()}
            className="border border-ink bg-ink px-3 py-2 text-sm font-semibold text-white"
          >
            Share
          </button>
          {shareNote && (
            <span className="self-center text-xs text-ink-muted">{shareNote}</span>
          )}
        </div>
      </header>

      {building.hazardFlag && (
        <div
          role="status"
          className="border-b border-shame/40 bg-shame-soft px-5 py-3 text-sm text-shame sm:px-8"
        >
          Open hazardous investigation/deficiency signal present for this address.
        </div>
      )}

      <section className="border-b border-line px-5 py-6 sm:px-8">
        {tier === 1 && building.score != null ? (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <p className="max-w-2xl text-base leading-relaxed text-ink">
                {TIER_COPY.tier1(building.score, building.evaluationCompletedOn)}
              </p>
              {building.letterGrade && (
                <div
                  className={`grade-mark text-6xl ${gradeInkClass(building.letterGrade)}`}
                >
                  {building.letterGrade}
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              {building.colourBand && (
                <span
                  className={`border px-2 py-1 text-xs font-semibold uppercase ${colourBandClasses(building.colourBand)}`}
                >
                  {colourBadgeLabel(building.colourBand)}
                </span>
              )}
              {percentile != null && (
                <span className="text-ink-muted">
                  {percentile}th percentile among scored RentSafeTO buildings in this
                  dataset
                </span>
              )}
            </div>
          </div>
        ) : tier === 2 ? (
          <p className="max-w-2xl text-base leading-relaxed text-ink">{TIER_COPY.tier2}</p>
        ) : (
          <div className="bg-canvas px-4 py-4">
            <p className="max-w-2xl text-base leading-relaxed text-ink-muted">
              {TIER_COPY.tier3}
            </p>
          </div>
        )}
      </section>

      {(building.records?.length || building.signals?.length) ? (
        <section className="border-b border-line px-5 py-6 sm:px-8">
          <h2 className="font-display text-xl font-semibold">Public record</h2>
          <ul className="mt-4 space-y-2">
            {(building.records ?? []).map((r, i) => (
              <li key={`r-${i}`} className="border border-line px-3 py-3 text-sm">
                <div className="font-semibold">{r.title}</div>
                <p className="mt-1 text-ink-muted">{r.detail}</p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  Source: {r.source}
                  {r.asOf ? ` · ${r.asOf}` : ''}
                </p>
              </li>
            ))}
            {(building.signals ?? []).map((s, i) => (
              <li key={`s-${i}`} className="border border-line px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.title}</span>
                  {s.hazard && (
                    <span className="border border-shame/40 bg-shame-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-shame">
                      Hazard
                    </span>
                  )}
                </div>
                <p className="mt-1 text-ink-muted">{s.detail}</p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  Source: {s.source}
                  {s.status ? ` · ${s.status}` : ''}
                  {s.asOf ? ` · ${s.asOf}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-b border-line px-5 py-6 sm:px-8">
        <h2 className="font-display text-xl font-semibold">Facts</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Fact label="Units" value={building.confirmedUnits} />
          <Fact label="Storeys" value={building.confirmedStoreys} />
          <Fact label="Property type" value={building.propertyType} />
          <Fact label="RSN" value={building.rsn} />
          <Fact label="Address id" value={building.addressPointId} />
        </dl>
      </section>

      {building.sources && building.sources.length > 0 && (
        <section className="border-b border-line px-5 py-6 sm:px-8">
          <h2 className="font-display text-xl font-semibold">Sources & licences</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            {building.sources.map((s, i) => (
              <li key={`${s.name}-${i}`}>
                <a href={s.url} className="font-semibold text-accent" target="_blank" rel="noreferrer">
                  {s.name}
                </a>
                {' — '}
                {s.licence}. {s.attribution}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="space-y-4 bg-canvas px-5 py-4 sm:px-8">
        <UsefulVote address={building.siteAddress} />
        <p className="text-xs leading-relaxed text-ink-muted">
          {TIER_COPY.footer}{' '}
          <a
            href={TENANT_REVIEW_LINK_OUT}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-accent"
          >
            Toronto tenant rights
          </a>
          .
        </p>
      </footer>
    </article>
  )
}

function Fact({
  label,
  value,
}: {
  label: string
  value: string | number | null | undefined
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 font-semibold">{value ?? '—'}</dd>
    </div>
  )
}
