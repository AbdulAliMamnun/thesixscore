import { useMemo, useState } from 'react'
import type { Building } from '../types'
import {
  buildTags,
  GROUP_LABELS,
  type CategoryMeta,
  type CategoryTag,
} from '../lib/categories'
import { CategoryChip } from './CategoryChips'

const GROUP_ORDER: CategoryMeta['group'][] = [
  'interior',
  'exterior',
  'mechanical',
  'security',
  'other',
]

export function WhyThisScore({ building }: { building: Building }) {
  const [open, setOpen] = useState(false)
  const tags = useMemo(
    () => buildTags(building.categoryScores ?? {}),
    [building.categoryScores],
  )
  const flagged = tags.filter((t) => t.severity === 'red' || t.severity === 'amber')
  const areasEvaluated =
    building.areasEvaluated ??
    (tags.length > 0 ? tags.length : null)

  if (tags.length === 0 && areasEvaluated == null) return null

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    items: tags.filter((t) => t.group === group),
  })).filter((g) => g.items.length > 0)

  return (
    <section className="border-b border-line px-5 py-6 sm:px-8">
      <h2 className="font-display text-xl font-semibold">Why this score</h2>
      {areasEvaluated != null && (
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          The City flagged {flagged.length} of {areasEvaluated} inspected areas as
          failing or needing improvement.
        </p>
      )}

      {flagged.length === 0 ? (
        <p className="mt-4 text-sm text-ink">
          No individual areas were flagged in the most recent inspection.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {flagged.map((t) => (
            <CategoryChip key={t.field} tag={t} />
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            className="text-sm font-semibold text-accent underline-offset-2 hover:underline"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? 'Hide inspected areas' : 'See all inspected areas'}
          </button>
          {open && (
            <div className="mt-4 space-y-5">
              {grouped.map((g) => (
                <div key={g.group}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    {g.label}
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {g.items.map((t) => (
                      <CategoryBarRow key={t.field} tag={t} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function CategoryBarRow({ tag }: { tag: CategoryTag }) {
  const width = `${Math.min(100, (tag.score / 3) * 100)}%`
  const barColor =
    tag.severity === 'red'
      ? 'bg-shame'
      : tag.severity === 'amber'
        ? 'bg-warn'
        : 'bg-good'
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-ink">{tag.label}</span>
          <span className="shrink-0 tabular-nums text-ink-muted">
            {tag.score}/3
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full bg-line">
          <div className={`h-full ${barColor}`} style={{ width }} />
        </div>
      </div>
    </li>
  )
}
