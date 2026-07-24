import { useEffect, useState, type FormEvent } from 'react'
import { formspreeConfigured, postFormspree, track } from '../lib/analytics'

const BUILDING_TYPES = [
  'Condo',
  'Rental apartment',
  'House or duplex',
  'Rooming house',
  'Not sure',
] as const

type BuildingType = (typeof BUILDING_TYPES)[number]

export function RequestBuildingForm({
  initialAddress = '',
  id,
}: {
  initialAddress?: string
  id?: string
}) {
  const [address, setAddress] = useState(initialAddress)
  const [buildingType, setBuildingType] = useState<BuildingType>('Not sure')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>(
    'idle',
  )
  const [submittedAddress, setSubmittedAddress] = useState('')

  useEffect(() => {
    setAddress(initialAddress)
  }, [initialAddress])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = address.trim()
    if (!trimmed) return
    setStatus('submitting')
    const ok = await postFormspree({
      type: 'building_request',
      address: trimmed,
      buildingType,
      email: email.trim() || undefined,
      timestamp: new Date().toISOString(),
    })
    // Even without Formspree configured, accept locally so UX isn't broken in dev.
    if (ok || !formspreeConfigured()) {
      track('request_building_submit')
      setSubmittedAddress(trimmed)
      setStatus('success')
      return
    }
    setStatus('error')
  }

  if (status === 'success') {
    return (
      <div
        id={id}
        className="panel mt-6 px-4 py-5 text-sm text-ink"
        role="status"
      >
        Thanks — we&apos;ve got it. {submittedAddress} is on the list.
      </div>
    )
  }

  return (
    <div id={id} className="panel mt-6 px-4 py-5">
      <h3 className="font-display text-lg font-semibold text-ink">
        Don&apos;t see your building? Tell us.
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        We&apos;re expanding beyond the City&apos;s rental inspection list. Add your
        address and we&apos;ll let you know when it&apos;s covered.
      </p>

      <form className="mt-4 space-y-3" onSubmit={(e) => void onSubmit(e)}>
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Address
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-accent"
          />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Building type
          <select
            value={buildingType}
            onChange={(e) => setBuildingType(e.target.value as BuildingType)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-accent"
          >
            {BUILDING_TYPES.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Email <span className="font-normal normal-case">(optional)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-accent"
          />
        </label>

        {status === 'error' && (
          <p className="text-sm text-shame" role="alert">
            Something went wrong sending your request.{' '}
            <a
              className="font-semibold underline"
              href={`mailto:corrections@thesixscore.example?subject=${encodeURIComponent(`Building request: ${address}`)}&body=${encodeURIComponent(`Address: ${address}\nType: ${buildingType}\nEmail: ${email}`)}`}
            >
              Email us instead
            </a>
            .
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'submitting' || !address.trim()}
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'submitting' && (
            <span
              className="inline-block h-3.5 w-3.5 animate-spin border-2 border-white/30 border-t-white"
              aria-hidden
            />
          )}
          {status === 'submitting' ? 'Sending…' : 'Submit request'}
        </button>
      </form>
    </div>
  )
}
