import type { Building } from '../types'

function normalizeAddress(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): string[] {
  return normalizeAddress(value).split(' ').filter(Boolean)
}

function scoreMatch(query: string, address: string): number {
  const q = normalizeAddress(query)
  const a = normalizeAddress(address)
  if (!q) return 0
  if (a === q) return 1000
  if (a.startsWith(q)) return 900
  if (a.includes(q)) return 800
  const qTokens = tokens(query)
  const aTokens = tokens(address)
  if (!qTokens.length) return 0
  let matched = 0
  for (const qt of qTokens) {
    if (aTokens.some((at) => at === qt || at.startsWith(qt) || qt.startsWith(at))) {
      matched++
    }
  }
  const coverage = matched / qTokens.length
  if (coverage < 0.5) return 0
  return Math.round(coverage * 500 + matched * 20)
}

export function searchBuildings(
  buildings: Building[],
  query: string,
  limit = 12,
): Building[] {
  const q = query.trim()
  if (!q) return []
  return buildings
    .map((building) => ({ building, score: scoreMatch(q, building.siteAddress) }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.building.siteAddress.localeCompare(b.building.siteAddress),
    )
    .slice(0, limit)
    .map((item) => item.building)
}
