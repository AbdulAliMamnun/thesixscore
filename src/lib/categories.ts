export type Severity = 'red' | 'amber' | 'green'

export interface CategoryMeta {
  field: string
  label: string
  group: 'interior' | 'exterior' | 'mechanical' | 'security' | 'other'
}

export const CATEGORY_META: CategoryMeta[] = [
  { field: 'ENTRANCE_LOBBY', label: 'Entrance & lobby', group: 'interior' },
  {
    field: 'ENTRANCE_DOORS_WINDOWS',
    label: 'Entrance doors & windows',
    group: 'exterior',
  },
  { field: 'SECURITY', label: 'Security', group: 'security' },
  { field: 'STAIRWELLS', label: 'Stairwells', group: 'interior' },
  { field: 'LAUNDRY_ROOMS', label: 'Laundry rooms', group: 'interior' },
  {
    field: 'INTERNAL_GUARDS_HANDRAILS',
    label: 'Guards & handrails',
    group: 'interior',
  },
  {
    field: 'GARBAGE_CHUTE_ROOMS',
    label: 'Garbage chute rooms',
    group: 'interior',
  },
  { field: 'GARBAGE_BIN_STORAGE_AREA', label: 'Garbage storage', group: 'other' },
  { field: 'ELEVATORS', label: 'Elevators', group: 'mechanical' },
  { field: 'STORAGE_AREAS_LOCKERS', label: 'Storage & lockers', group: 'other' },
  {
    field: 'INTERIOR_WALL_CEILING_FLOOR',
    label: 'Walls, ceilings & floors',
    group: 'interior',
  },
  {
    field: 'INTERIOR_LIGHTING_LEVELS',
    label: 'Interior lighting',
    group: 'interior',
  },
  { field: 'GRAFFITI', label: 'Graffiti', group: 'exterior' },
  { field: 'EXTERIOR_CLADDING', label: 'Exterior cladding', group: 'exterior' },
  { field: 'EXTERIOR_GROUNDS', label: 'Exterior grounds', group: 'exterior' },
  { field: 'EXTERIOR_WALKWAYS', label: 'Walkways', group: 'exterior' },
  { field: 'BALCONY_GUARDS', label: 'Balcony guards', group: 'exterior' },
  {
    field: 'WATER_PEN_EXT_BLDG_ELEMENTS',
    label: 'Water penetration',
    group: 'exterior',
  },
  { field: 'PARKING_AREA', label: 'Parking area', group: 'exterior' },
  { field: 'OTHER_FACILITIES', label: 'Other facilities', group: 'other' },
]

export const CATEGORY_FIELDS = CATEGORY_META.map((c) => c.field)

export interface CategoryTag {
  field: string
  label: string
  severity: Severity
  score: number
  group: CategoryMeta['group']
}

const SEVERITY_ORDER: Record<Severity, number> = {
  red: 0,
  amber: 1,
  green: 2,
}

export function normalizeFieldKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function severityForScore(score: number): Severity {
  if (score <= 1) return 'red'
  if (score === 2) return 'amber'
  return 'green'
}

export function chipTitle(score: number, severity: Severity): string {
  if (severity === 'red') return `Scored ${score} of 3 — failing`
  if (severity === 'amber') return `Scored ${score} of 3 — needs improvement`
  return `Scored ${score} of 3 — satisfactory`
}

/**
 * Match CATEGORY_META fields case-insensitively against a source record.
 * Skips absent, null, empty, and zero values — those were not evaluated.
 */
export function extractCategoryScores(
  record: Record<string, unknown>,
): Record<string, number> {
  const byNorm = new Map<string, unknown>()
  for (const [key, value] of Object.entries(record)) {
    byNorm.set(normalizeFieldKey(key), value)
  }

  const out: Record<string, number> = {}
  for (const meta of CATEGORY_META) {
    if (!byNorm.has(normalizeFieldKey(meta.field))) continue
    const raw = byNorm.get(normalizeFieldKey(meta.field))
    if (raw == null || raw === '') continue
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
    if (!Number.isFinite(n) || n === 0) continue
    out[meta.field] = n
  }
  return out
}

export function extractAreasEvaluated(
  record: Record<string, unknown>,
): number | null {
  const byNorm = new Map<string, unknown>()
  for (const [key, value] of Object.entries(record)) {
    byNorm.set(normalizeFieldKey(key), value)
  }
  const raw = byNorm.get(normalizeFieldKey('NO_OF_AREAS_EVALUATED'))
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function buildTags(
  record: Record<string, unknown> | Record<string, number> | null | undefined,
): CategoryTag[] {
  if (!record) return []
  const scores = extractCategoryScores(record as Record<string, unknown>)
  const tags: CategoryTag[] = []
  for (const meta of CATEGORY_META) {
    const score = scores[meta.field]
    if (score == null || score === 0) continue
    tags.push({
      field: meta.field,
      label: meta.label,
      severity: severityForScore(score),
      score,
      group: meta.group,
    })
  }

  return tags.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return a.label.localeCompare(b.label)
  })
}

export const GROUP_LABELS: Record<CategoryMeta['group'], string> = {
  interior: 'Interior',
  exterior: 'Exterior',
  mechanical: 'Mechanical',
  security: 'Security',
  other: 'Other',
}
