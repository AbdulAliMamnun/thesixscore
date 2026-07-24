import type { Building, ColourBand, LetterGrade } from '../types'

export function colourFromScore(score: number): ColourBand {
  if (score >= 85) return 'green'
  if (score >= 70) return 'yellow'
  return 'red'
}

export function letterGradeFromScore(score: number): LetterGrade {
  if (score >= 90) return 'A'
  if (score >= 85) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export function colourBadgeLabel(band: ColourBand | null): string {
  if (band === 'green') return 'Green'
  if (band === 'yellow') return 'Yellow'
  if (band === 'red') return 'Red'
  return 'Unrated'
}

export function formatWard(building: Building): string {
  const parts = [building.ward, building.wardName].filter(Boolean)
  return parts.length ? parts.join(' — ') : '—'
}

export function percentileRank(
  building: Building,
  scoredBuildings: Building[],
): number | null {
  if (building.score == null || scoredBuildings.length === 0) return null
  const below = scoredBuildings.filter((b) => (b.score ?? 0) < building.score!).length
  return Math.round((below / scoredBuildings.length) * 100)
}

/**
 * Share of scored buildings this building outperforms, floored at 1 for the worst.
 * Callers invert the prose for the top half.
 */
export function outperformShare(
  building: Building,
  scoredBuildings: Building[],
): number | null {
  if (building.score == null || scoredBuildings.length === 0) return null
  const below = scoredBuildings.filter((b) => (b.score ?? 0) < building.score!).length
  const pct = Math.round((below / scoredBuildings.length) * 100)
  return Math.max(1, pct)
}

export function percentileProse(
  building: Building,
  scoredBuildings: Building[],
): string | null {
  const share = outperformShare(building, scoredBuildings)
  if (share == null) return null
  // Top half: share of buildings outperformed is >= 50 → "higher than"
  if (share >= 50) {
    return `Scores higher than ${share}% of inspected Toronto rental buildings.`
  }
  // Bottom half: invert to "lower than" using the complement, floored at 1
  const lowerThan = Math.max(1, 100 - share)
  return `Scores lower than ${lowerThan}% of inspected Toronto rental buildings.`
}
