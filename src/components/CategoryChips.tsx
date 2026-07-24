import type { CategoryTag, Severity } from '../lib/categories'
import { chipTitle } from '../lib/categories'

const CHIP_CLASS: Record<Severity, string> = {
  red: 'border-shame/40 bg-shame-soft text-shame',
  amber: 'border-warn/40 bg-amber-50 text-warn',
  green: 'border-good/30 bg-emerald-50 text-good',
}

export function CategoryChip({ tag }: { tag: CategoryTag }) {
  return (
    <span
      title={chipTitle(tag.score, tag.severity)}
      className={`inline-flex max-w-full truncate border px-2 py-0.5 text-[11px] font-semibold ${CHIP_CLASS[tag.severity]}`}
    >
      {tag.label}
    </span>
  )
}

/** Compact chips for list/ranking rows: up to 3 reds then ambers, with +N. */
export function CategoryChipRow({
  tags,
  limit = 3,
}: {
  tags: CategoryTag[]
  limit?: number
}) {
  const flagged = tags.filter((t) => t.severity === 'red' || t.severity === 'amber')
  if (flagged.length === 0) return null
  const shown = flagged.slice(0, limit)
  const extra = flagged.length - shown.length
  return (
    <div className="mt-1 flex max-w-full flex-wrap items-center gap-1">
      {shown.map((t) => (
        <CategoryChip key={t.field} tag={t} />
      ))}
      {extra > 0 && (
        <span className="text-[10px] font-semibold text-ink-muted">+{extra}</span>
      )}
    </div>
  )
}
