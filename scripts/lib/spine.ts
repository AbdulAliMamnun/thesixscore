import {
  asNumber,
  canonicalFromFreeform,
  canonicalKey,
  haversineM,
  parseGeometry,
  slugify,
} from './address.ts'
import type { SpineAddress } from './types.ts'

export class AddressSpine {
  byId = new Map<string, SpineAddress>()
  byKey = new Map<string, string[]>()
  grid = new Map<string, string[]>()

  add(row: Record<string, unknown>): void {
    const addressId = String(row.ADDRESS_POINT_ID ?? '').trim()
    if (!addressId) return
    const { lat, lng } = parseGeometry(row.geometry)
    const key = canonicalKey(
      row.LO_NUM ?? row.ADDRESS_NUMBER,
      row.LINEAR_NAME,
      row.LINEAR_NAME_TYPE,
      row.LINEAR_NAME_DIR,
    )
    if (!key) return
    const fullAddress = String(row.ADDRESS_FULL ?? key).trim()
    const rec: SpineAddress = {
      addressId,
      streetNumber: String(row.LO_NUM ?? row.ADDRESS_NUMBER ?? ''),
      streetName: [row.LINEAR_NAME, row.LINEAR_NAME_TYPE, row.LINEAR_NAME_DIR]
        .filter((x) => x != null && String(x).trim())
        .join(' '),
      unit: null,
      lat,
      lng,
      fullAddress,
      canonicalKey: key,
      ward: row.WARD_NAME != null ? String(row.WARD_NAME) : null,
    }
    this.byId.set(addressId, rec)
    const list = this.byKey.get(key) ?? []
    list.push(addressId)
    this.byKey.set(key, list)
    if (lat != null && lng != null) {
      const cell = this.cellKey(lat, lng)
      const g = this.grid.get(cell) ?? []
      g.push(addressId)
      this.grid.set(cell, g)
    }
  }

  private cellKey(lat: number, lng: number): string {
    return `${Math.floor(lat / 0.000225)}:${Math.floor(lng / 0.0003)}`
  }

  resolve(opts: {
    key?: string | null
    lat?: number | null
    lng?: number | null
  }): SpineAddress | null {
    if (opts.key) {
      const ids = this.byKey.get(opts.key)
      if (ids?.length) return this.byId.get(ids[0]!) ?? null
    }
    if (opts.lat != null && opts.lng != null) {
      let best: SpineAddress | null = null
      let bestD = 26
      const [ci, cj] = this.cellKey(opts.lat, opts.lng).split(':').map(Number)
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const cell = `${ci! + di}:${cj! + dj}`
          for (const id of this.grid.get(cell) ?? []) {
            const rec = this.byId.get(id)
            if (!rec?.lat || !rec.lng) continue
            const d = haversineM(opts.lat, opts.lng, rec.lat, rec.lng)
            if (d < bestD) {
              bestD = d
              best = rec
            }
          }
        }
      }
      return best
    }
    return null
  }

  resolveFreeform(
    address: unknown,
    lat?: unknown,
    lng?: unknown,
  ): SpineAddress | null {
    return this.resolve({
      key: canonicalFromFreeform(address),
      lat: asNumber(lat),
      lng: asNumber(lng),
    })
  }
}

export function buildingIdFor(spine: SpineAddress): string {
  return spine.addressId
}

export function buildingSlug(spine: SpineAddress): string {
  return slugify(spine.fullAddress, spine.addressId)
}

export { asNumber, canonicalFromFreeform, canonicalKey }
