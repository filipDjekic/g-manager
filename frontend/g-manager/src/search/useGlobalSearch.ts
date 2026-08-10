import { useEffect, useState } from 'react'
import { searchApi, type SearchResult } from '../api/searchApi'

export function useGlobalSearch(open: boolean, query: string) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [favorites, setFavorites] = useState<SearchResult[]>([])
  const [recents, setRecents] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    if (query.trim().length < 2) {
      const preferenceTimer = window.setTimeout(() => {
        setLoading(true)
        void Promise.all([searchApi.preferences(true, controller.signal), searchApi.preferences(false, controller.signal)])
          .then(([favoriteItems, recentItems]) => { setFavorites(favoriteItems); setRecents(recentItems); setResults([]); setError('') })
          .catch((cause) => { if (cause?.code !== 'ERR_CANCELED') setError('Prethodne pretrage nisu dostupne.') })
          .finally(() => setLoading(false))
      }, 0)
      return () => { window.clearTimeout(preferenceTimer); controller.abort() }
    }
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchApi.search(query.trim(), controller.signal)
        .then((response) => { setResults(response.results); setError('') })
        .catch((cause) => { if (cause?.code !== 'ERR_CANCELED') setError('Pretragu nije moguće izvršiti.') })
        .finally(() => setLoading(false))
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [open, query])

  return { results, favorites, recents, loading, error }
}
