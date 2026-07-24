import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

export const CKAN_BASE =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action'

export class CkanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CkanError'
  }
}

export async function ckanAction<T>(
  action: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v))
  const url = `${CKAN_BASE}/${action}?${qs.toString()}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TheSixScoreBuildData/1.0' },
  })
  if (res.status === 404) {
    throw new CkanError(`CKAN package_show/action 404 for ${action}: ${url}`)
  }
  if (!res.ok) {
    throw new CkanError(`CKAN HTTP ${res.status} for ${url}`)
  }
  const body = (await res.json()) as {
    success: boolean
    result: T
    error?: { message?: string }
  }
  if (!body.success) {
    throw new CkanError(
      body.error?.message ?? `CKAN action ${action} returned success=false`,
    )
  }
  return body.result
}

export interface CkanResource {
  id: string
  name?: string
  format?: string
  url?: string
  datastore_active?: boolean | string
}

export interface CkanPackage {
  id: string
  name: string
  title?: string
  resources: CkanResource[]
}

export function isDatastoreActive(r: CkanResource): boolean {
  return (
    r.datastore_active === true ||
    r.datastore_active === 'true' ||
    r.datastore_active === 'True'
  )
}

export function pickDatastoreResource(
  pkg: CkanPackage,
  preferNameIncludes?: string[],
): CkanResource {
  const active = pkg.resources.filter(isDatastoreActive)
  if (!active.length) {
    throw new CkanError(
      `No datastore_active resource on package ${pkg.name} (${pkg.id})`,
    )
  }
  if (preferNameIncludes?.length) {
    const hit = active.find((r) =>
      preferNameIncludes.some((p) =>
        (r.name ?? '').toLowerCase().includes(p.toLowerCase()),
      ),
    )
    if (hit) return hit
  }
  return active[0]!
}

export async function packageShow(idOrSlug: string): Promise<CkanPackage> {
  try {
    return await ckanAction<CkanPackage>('package_show', { id: idOrSlug })
  } catch (err) {
    if (err instanceof CkanError) throw err
    throw new CkanError(
      `package_show failed for ${idOrSlug}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export async function datastoreAll(
  resourceId: string,
  opts: { fields?: string; pageSize?: number; maxRecords?: number | null } = {},
): Promise<{ records: Record<string, unknown>[]; fields: string[]; total: number }> {
  const pageSize = opts.pageSize ?? 32000
  const records: Record<string, unknown>[] = []
  let fields: string[] = []
  let total = 0
  let offset = 0

  while (true) {
    const params: Record<string, string | number> = {
      resource_id: resourceId,
      limit: pageSize,
      offset,
    }
    if (opts.fields) params.fields = opts.fields
    const result = await ckanAction<{
      records: Record<string, unknown>[]
      fields: { id: string }[]
      total: number
    }>('datastore_search', params)
    total = result.total
    fields = (result.fields ?? []).map((f) => f.id)
    const batch = result.records ?? []
    records.push(...batch)
    console.log(
      `  datastore ${resourceId.slice(0, 8)}… +${batch.length} (have ${records.length}/${total})`,
    )
    offset += batch.length
    if (!batch.length || offset >= total) break
    if (opts.maxRecords != null && records.length >= opts.maxRecords) {
      return { records: records.slice(0, opts.maxRecords), fields, total }
    }
  }
  return { records, fields, total }
}

export function requireColumns(
  fields: string[],
  required: string[],
  context: string,
): void {
  const upper = new Map(fields.map((f) => [f.toUpperCase(), f]))
  const missing: string[] = []
  for (const req of required) {
    const ok = fields.some(
      (f) =>
        f.toUpperCase() === req.toUpperCase() ||
        f.toUpperCase().replace(/[\s_]+/g, '_') ===
          req.toUpperCase().replace(/[\s_]+/g, '_'),
    )
    if (!ok && !upper.has(req.toUpperCase())) {
      // flexible: also accept space/underscore variants already covered
      const norm = req.toUpperCase().replace(/[\s_]+/g, '')
      const found = fields.some(
        (f) => f.toUpperCase().replace(/[\s_]+/g, '') === norm,
      )
      if (!found) missing.push(req)
    }
  }
  if (missing.length) {
    throw new CkanError(
      `Missing confirmed columns on ${context}: ${missing.join(', ')}. Have: ${fields.join(', ')}`,
    )
  }
}

export function getField(
  row: Record<string, unknown>,
  ...candidates: string[]
): unknown {
  const map = new Map<string, unknown>()
  for (const [k, v] of Object.entries(row)) {
    map.set(k.toUpperCase().replace(/[\s_]+/g, '_'), v)
    map.set(k.toUpperCase().replace(/[\s_]+/g, ''), v)
  }
  for (const c of candidates) {
    const a = c.toUpperCase().replace(/[\s_]+/g, '_')
    const b = c.toUpperCase().replace(/[\s_]+/g, '')
    if (map.has(a) && map.get(a) !== '' && map.get(a) != null) return map.get(a)
    if (map.has(b) && map.get(b) !== '' && map.get(b) != null) return map.get(b)
  }
  return undefined
}

export async function downloadToFile(url: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true })
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TheSixScoreBuildData/1.0' },
  })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status}: ${url}`)
  }
  const file = createWriteStream(dest)
  // @ts-expect-error Node fetch body is a web stream
  await pipeline(Readable.fromWeb(res.body), file)
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data), 'utf8')
}
