import { Link } from 'react-router-dom'
import type { Building } from '../types'
import { colourBadgeLabel } from '../lib/normalize'
import { colourBandClasses, gradeInkClass } from '../lib/ui'
import { usePreferences } from '../context/PreferencesContext'

function recordKey(building: Building): string {
  return building.addressPointId || building.rsn
}

export function BuildingListItem({
  building,
  emphasizeShame = false,
  selectable = false,
}: {
  building: Building
  emphasizeShame?: boolean
  selectable?: boolean
}) {
  const { isFavorite, inCompare, toggleFavoriteId, toggleCompareId } =
    usePreferences()
  const id = recordKey(building)
  const href = building.slug
    ? `/address/${building.slug}`
    : building.addressPointId
      ? `/address/${building.addressPointId}`
      : `/building/${building.rsn}`

  return (
    <div
      className={`flex items-stretch gap-1 border-b border-line last:border-b-0 ${
        emphasizeShame ? 'bg-shame-soft/40' : ''
      }`}
    >
      <Link
        to={href}
        onClick={() => {
          if (building.tier === 3 && building.addressPointId) {
            sessionStorage.setItem(
              `tss:addr:${building.addressPointId}`,
              JSON.stringify({
                addressPointId: building.addressPointId,
                canonicalAddress: building.siteAddress,
                ward: building.ward,
                lat: building.latitude,
                lng: building.longitude,
                tier: 3,
                rentSafeScore: null,
                rentSafe: null,
                signals: [],
                hazardFlag: false,
              }),
            )
          }
        }}
        className="group flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-3 no-underline transition hover:bg-accent-soft/60"
      >
        <div className="min-w-0">
          <div className="truncate font-semibold tracking-tight text-ink group-hover:text-accent">
            {building.siteAddress}
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {[
              building.wardName ?? building.ward,
              building.tier ? `Tier ${building.tier}` : null,
              building.propertyType,
            ]
              .filter(Boolean)
              .join(' · ') || 'Toronto'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {building.hazardFlag && (
            <span className="border border-shame/40 bg-shame-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-shame">
              Hazard
            </span>
          )}
          {building.tier === 1 && building.score != null ? (
            <span className="tabular-nums text-sm font-semibold text-ink">
              {building.score}
            </span>
          ) : building.tier === 2 ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              Records
            </span>
          ) : building.tier === 3 ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              No records
            </span>
          ) : building.score != null ? (
            <span className="tabular-nums text-sm font-semibold text-ink">
              {building.score}
            </span>
          ) : (
            <span className="text-xs text-ink-muted">No score</span>
          )}
          {building.tier === 1 && building.letterGrade && (
            <span
              className={`grade-mark text-xl ${gradeInkClass(building.letterGrade)}`}
            >
              {building.letterGrade}
            </span>
          )}
          {building.tier === 1 && building.colourBand && (
            <span
              className={`hidden border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline ${colourBandClasses(building.colourBand)}`}
            >
              {colourBadgeLabel(building.colourBand)}
            </span>
          )}
        </div>
      </Link>

      {selectable && (
        <div className="flex flex-col justify-center gap-1 border-l border-line px-1.5">
          <button
            type="button"
            title={isFavorite(id) ? 'Remove from saved' : 'Save building'}
            onClick={() => toggleFavoriteId(id)}
            className={`px-2 py-1 text-xs font-semibold ${
              isFavorite(id) ? 'text-accent' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {isFavorite(id) ? 'Saved' : 'Save'}
          </button>
          <button
            type="button"
            title={inCompare(id) ? 'Remove from compare' : 'Add to compare'}
            onClick={() => toggleCompareId(id)}
            className={`px-2 py-1 text-xs font-semibold ${
              inCompare(id) ? 'text-accent' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {inCompare(id) ? 'Comparing' : 'Compare'}
          </button>
        </div>
      )}
    </div>
  )
}
