import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clearCompare,
  getCompareList,
  getFavorites,
  getRecent,
  pushRecent,
  toggleCompare,
  toggleFavorite,
} from '../lib/preferences'

interface PreferencesContextValue {
  favorites: string[]
  compare: string[]
  recent: string[]
  isFavorite: (rsn: string) => boolean
  inCompare: (rsn: string) => boolean
  toggleFavoriteId: (rsn: string) => void
  toggleCompareId: (rsn: string) => boolean
  clearCompareList: () => void
  recordVisit: (rsn: string) => void
  compareLimitedMessage: string | null
  dismissCompareMessage: () => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([])
  const [compare, setCompare] = useState<string[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [compareLimitedMessage, setCompareLimitedMessage] = useState<string | null>(
    null,
  )

  useEffect(() => {
    setFavorites(getFavorites())
    setCompare(getCompareList())
    setRecent(getRecent())
  }, [])

  const toggleFavoriteId = useCallback((rsn: string) => {
    setFavorites(toggleFavorite(rsn))
  }, [])

  const toggleCompareId = useCallback((rsn: string) => {
    const result = toggleCompare(rsn)
    setCompare(result.list)
    if (result.limited) {
      setCompareLimitedMessage('You can compare up to 3 buildings at a time.')
      return false
    }
    setCompareLimitedMessage(null)
    return true
  }, [])

  const clearCompareList = useCallback(() => {
    setCompare(clearCompare())
    setCompareLimitedMessage(null)
  }, [])

  const recordVisit = useCallback((rsn: string) => {
    setRecent(pushRecent(rsn))
  }, [])

  const value = useMemo<PreferencesContextValue>(
    () => ({
      favorites,
      compare,
      recent,
      isFavorite: (rsn) => favorites.includes(rsn),
      inCompare: (rsn) => compare.includes(rsn),
      toggleFavoriteId,
      toggleCompareId,
      clearCompareList,
      recordVisit,
      compareLimitedMessage,
      dismissCompareMessage: () => setCompareLimitedMessage(null),
    }),
    [
      favorites,
      compare,
      recent,
      toggleFavoriteId,
      toggleCompareId,
      clearCompareList,
      recordVisit,
      compareLimitedMessage,
    ],
  )

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) {
    throw new Error('usePreferences must be used within PreferencesProvider')
  }
  return ctx
}
