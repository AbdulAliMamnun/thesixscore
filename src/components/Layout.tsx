import { Link, NavLink, Outlet } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { usePreferences } from '../context/PreferencesContext'
import { CompareDock } from './CompareDock'

export function Layout() {
  const { meta } = useData()
  const { favorites, compare } = usePreferences()

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-28 pt-5 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <Link to="/" className="no-underline">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            TheSixScore
          </span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            Toronto RentSafeTO evaluations
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-1 text-sm font-semibold">
          <NavLink
            to="/"
            end
            className={({ isActive }) => navClass(isActive)}
          >
            Search
          </NavLink>
          <NavLink
            to="/scoring"
            className={({ isActive }) => navClass(isActive)}
          >
            Scoring & coverage
          </NavLink>
          <NavLink
            to="/rankings"
            className={({ isActive }) => navClass(isActive)}
          >
            Rankings
          </NavLink>
          <NavLink
            to="/saved"
            className={({ isActive }) => navClass(isActive)}
          >
            Saved{favorites.length ? ` (${favorites.length})` : ''}
          </NavLink>
          <NavLink
            to="/compare"
            className={({ isActive }) => navClass(isActive)}
          >
            Compare{compare.length ? ` (${compare.length})` : ''}
          </NavLink>
        </nav>
      </header>

      {meta?.scoresUnavailable && (
        <div
          role="status"
          className="mb-6 border border-warn/30 bg-amber-50 px-4 py-3 text-sm text-warn"
        >
          Live evaluation scores may be unavailable. Showing building registration
          facts only — the evaluation dataset had no active CSV datastore resource.
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-14 border-t border-line pt-5 text-xs leading-relaxed text-ink-muted">
        Data from the City of Toronto Open Data Portal (RentSafeTO). TheSixScore is
        an independent client-side tool and is not affiliated with the City of
        Toronto.
      </footer>

      <CompareDock />
    </div>
  )
}

function navClass(isActive: boolean): string {
  return `px-3 py-2 no-underline transition ${
    isActive
      ? 'border-b-2 border-ink text-ink'
      : 'text-ink-muted hover:text-ink'
  }`
}
