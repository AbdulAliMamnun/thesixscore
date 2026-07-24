import { Link } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { usePreferences } from '../context/PreferencesContext'

export function CompareDock() {
  const { compare, clearCompareList, compareLimitedMessage, dismissCompareMessage } =
    usePreferences()
  const { byRsn, byAddressId } = useData()

  if (compare.length === 0 && !compareLimitedMessage) return null

  const names = compare
    .map((id) => byAddressId.get(id)?.siteAddress || byRsn.get(id)?.siteAddress || id)
    .slice(0, 3)

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0 text-sm">
          {compareLimitedMessage ? (
            <p role="status">
              {compareLimitedMessage}{' '}
              <button
                type="button"
                className="underline"
                onClick={dismissCompareMessage}
              >
                Dismiss
              </button>
            </p>
          ) : (
            <p>
              Comparing {compare.length}/3:{' '}
              <span className="text-white/75">{names.join(' · ')}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearCompareList}
            className="border border-white/30 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
          >
            Clear
          </button>
          <Link
            to="/compare"
            className="bg-white px-3 py-1.5 text-sm font-semibold text-ink no-underline hover:bg-accent-soft"
          >
            Open compare
          </Link>
        </div>
      </div>
    </div>
  )
}
