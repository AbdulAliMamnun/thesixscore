/**
 * Optional Plausible + Formspree helpers.
 * Silently no-ops when VITE_PLAUSIBLE_DOMAIN / VITE_FORMSPREE_ENDPOINT are unset.
 */

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number> },
    ) => void
  }
}

const FORMSPREE = import.meta.env.VITE_FORMSPREE_ENDPOINT as string | undefined

const loggedMisses = new Set<string>()

export function track(
  event: string,
  props?: Record<string, string | number>,
): void {
  try {
    if (typeof window === 'undefined') return
    if (typeof window.plausible !== 'function') return
    if (props) window.plausible(event, { props })
    else window.plausible(event)
  } catch {
    /* swallow */
  }
}

export function logMissedQuery(query: string): void {
  const q = query.trim()
  if (!q) return
  if (loggedMisses.has(q)) return
  loggedMisses.add(q)

  track('search_miss', { query: q })

  const endpoint = FORMSPREE?.trim()
  if (!endpoint) return

  try {
    void fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'missed_query',
        query: q,
        timestamp: new Date().toISOString(),
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      }),
    }).catch(() => {
      /* fire-and-forget */
    })
  } catch {
    /* swallow */
  }
}

export async function postFormspree(
  payload: Record<string, unknown>,
): Promise<boolean> {
  const endpoint = FORMSPREE?.trim()
  if (!endpoint) return false
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

export function formspreeConfigured(): boolean {
  return Boolean(FORMSPREE?.trim())
}
