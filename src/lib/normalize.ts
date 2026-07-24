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
