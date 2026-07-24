import { useState, type FormEvent } from 'react'
import { postFormspree, track } from '../lib/analytics'

export function UsefulVote({ address }: { address: string }) {
  const [state, setState] = useState<'ask' | 'thanks' | 'down'>('ask')
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)

  function onUp() {
    track('feedback_vote', { vote: 'up' })
    setState('thanks')
  }

  function onDown() {
    track('feedback_vote', { vote: 'down' })
    setState('down')
  }

  async function onSubmitComment(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    await postFormspree({
      type: 'feedback',
      address,
      comment: comment.trim(),
      timestamp: new Date().toISOString(),
    })
    // Typed feedback goes to Formspree only — never Plausible.
    setSending(false)
    setState('thanks')
  }

  if (state === 'thanks') {
    return (
      <p className="text-sm text-ink-muted" role="status">
        Thanks.
      </p>
    )
  }

  if (state === 'down') {
    return (
      <form onSubmit={(e) => void onSubmitComment(e)} className="space-y-2">
        <label className="block text-sm text-ink">
          What were you looking for?
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={sending}
          className="border border-ink bg-ink px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-ink">Was this useful?</span>
      <button
        type="button"
        onClick={onUp}
        className="border border-line px-3 py-1.5 font-semibold hover:border-accent"
        aria-label="Thumbs up"
      >
        👍
      </button>
      <button
        type="button"
        onClick={onDown}
        className="border border-line px-3 py-1.5 font-semibold hover:border-accent"
        aria-label="Thumbs down"
      >
        👎
      </button>
    </div>
  )
}
