export function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '')
}

export function cleanToken(value: unknown): string {
  if (value == null) return ''
  return stripDiacritics(String(value))
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STREET_EXPAND: Record<string, string> = {
  STREET: 'ST',
  AVENUE: 'AVE',
  BOULEVARD: 'BLVD',
  DRIVE: 'DR',
  ROAD: 'RD',
  COURT: 'CRT',
  CRESCENT: 'CRES',
  PLACE: 'PL',
  TERRACE: 'TERR',
  PARKWAY: 'PKWY',
  CIRCLE: 'CIR',
  LANE: 'LN',
  TRAIL: 'TRL',
  GATE: 'GT',
  SQUARE: 'SQ',
  HEIGHTS: 'HTS',
}

const DIR_EXPAND: Record<string, string> = {
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  NORTHWEST: 'NW',
  NORTHEAST: 'NE',
  SOUTHWEST: 'SW',
  SOUTHEAST: 'SE',
}

export function normalizeStreetType(value: unknown): string {
  const t = cleanToken(value)
  return STREET_EXPAND[t] ?? t
}

export function normalizeDir(value: unknown): string {
  const t = cleanToken(value)
  return DIR_EXPAND[t] ?? t
}

export function canonicalKey(
  number: unknown,
  street: unknown,
  streetType: unknown = '',
  direction: unknown = '',
): string | null {
  let num = cleanToken(number)
  if (!num) return null
  const range = num.match(/^(\d+)\s*[-–]\s*\d+/)
  if (range) num = range[1]!
  else {
    const m = num.match(/^(\d+)/)
    num = m ? m[1]! : num
  }
  const streetName = cleanToken(street)
  if (!streetName) return null
  const stype = normalizeStreetType(streetType)
  const dir = normalizeDir(direction)
  return [num, streetName, stype, dir].filter(Boolean).join(' ')
}

const UNIT_RE = /^(?:UNIT|APT|APARTMENT|STE|SUITE|#)\s*[-A-Z0-9]+[,]?\s+/i

export function canonicalFromFreeform(address: unknown): string | null {
  if (address == null) return null
  let text = cleanToken(address)
  text = text.replace(UNIT_RE, '')
  text = text.replace(/\bTORONTO\b.*$/, '').trim()
  const m = text.match(/^(\d+[A-Z]?)\s+(.+)$/)
  if (!m) return null
  const num = m[1]!
  const tokens = m[2]!.split(' ')
  let direction = ''
  let stype = ''
  if (
    tokens.length &&
    (tokens[tokens.length - 1]! in DIR_EXPAND ||
      Object.values(DIR_EXPAND).includes(tokens[tokens.length - 1]!))
  ) {
    direction = normalizeDir(tokens.pop())
  }
  if (
    tokens.length &&
    (tokens[tokens.length - 1]! in STREET_EXPAND ||
      Object.values(STREET_EXPAND).includes(tokens[tokens.length - 1]!))
  ) {
    stype = normalizeStreetType(tokens.pop())
  }
  return canonicalKey(num, tokens.join(' '), stype, direction)
}

export function slugify(address: string, id: string): string {
  const base = address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${base || 'building'}-${id}`
}

export function parseGeometry(
  geom: unknown,
): { lat: number | null; lng: number | null } {
  if (geom == null) return { lat: null, lng: null }
  let g = geom
  if (typeof g === 'string') {
    try {
      g = JSON.parse(g)
    } catch {
      return { lat: null, lng: null }
    }
  }
  if (
    typeof g === 'object' &&
    g &&
    (g as { type?: string }).type === 'Point' &&
    Array.isArray((g as { coordinates?: number[] }).coordinates)
  ) {
    const coords = (g as { coordinates: number[] }).coordinates
    return { lat: Number(coords[1]), lng: Number(coords[0]) }
  }
  return { lat: null, lng: null }
}

export function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const p1 = toRad(lat1)
  const p2 = toRad(lat2)
  const dp = toRad(lat2 - lat1)
  const dl = toRad(lon2 - lon1)
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
