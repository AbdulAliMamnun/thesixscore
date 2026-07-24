const FAVORITES_KEY = 'thesixscore:favorites'
const COMPARE_KEY = 'thesixscore:compare'
const RECENT_KEY = 'thesixscore:recent'

const MAX_COMPARE = 3
const MAX_RECENT = 8

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    return []
  }
}

function writeList(key: string, values: string[]): void {
  localStorage.setItem(key, JSON.stringify(values))
}

export function getFavorites(): string[] {
  return readList(FAVORITES_KEY)
}

export function toggleFavorite(rsn: string): string[] {
  const current = getFavorites()
  const next = current.includes(rsn)
    ? current.filter((id) => id !== rsn)
    : [rsn, ...current]
  writeList(FAVORITES_KEY, next)
  return next
}

export function getCompareList(): string[] {
  return readList(COMPARE_KEY)
}

export function toggleCompare(rsn: string): { list: string[]; limited: boolean } {
  const current = getCompareList()
  if (current.includes(rsn)) {
    const list = current.filter((id) => id !== rsn)
    writeList(COMPARE_KEY, list)
    return { list, limited: false }
  }
  if (current.length >= MAX_COMPARE) {
    return { list: current, limited: true }
  }
  const list = [...current, rsn]
  writeList(COMPARE_KEY, list)
  return { list, limited: false }
}

export function clearCompare(): string[] {
  writeList(COMPARE_KEY, [])
  return []
}

export function getRecent(): string[] {
  return readList(RECENT_KEY)
}

export function pushRecent(rsn: string): string[] {
  const next = [rsn, ...getRecent().filter((id) => id !== rsn)].slice(0, MAX_RECENT)
  writeList(RECENT_KEY, next)
  return next
}

export const COMPARE_LIMIT = MAX_COMPARE
