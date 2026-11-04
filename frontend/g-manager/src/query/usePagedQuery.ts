import { useEffect } from 'react'
import { useResettableState } from '../components/useResettableState'
import { useQuery } from '@tanstack/react-query'
import type { PageResponse } from '../types/api.types'

export function usePagedQuery<T>(key: readonly unknown[], load: (page: number, size: number) => Promise<PageResponse<T>>, size = 10, enabled = true, refetchInterval?: number | ((data: PageResponse<T> | undefined) => number | false)) {
  const [page, setPage] = useResettableState(() => 0, JSON.stringify(key))
  const query = useQuery({ queryKey: [...key, { page, size }], queryFn: () => load(page, size), enabled, refetchIntervalInBackground: false, refetchInterval: query => typeof refetchInterval === 'function' ? refetchInterval(query.state.data) : refetchInterval })
  useEffect(() => {
    if (query.data && !query.isFetching && page >= Math.max(1, query.data.totalPages)) {
      setPage(Math.max(0, query.data.totalPages - 1))
    }
  }, [query.data, query.isFetching, page, setPage])
  return { ...query, page, setPage, size }
}
