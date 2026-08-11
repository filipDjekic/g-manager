import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchApi } from '../api/searchApi'
import { useGlobalSearch } from './useGlobalSearch'

vi.mock('../api/searchApi', () => ({
  searchApi: {
    search: vi.fn(), preferences: vi.fn(), remember: vi.fn(), removeFavorite: vi.fn(),
  },
}))

describe('useGlobalSearch', () => {
  afterEach(() => vi.useRealTimers())

  it('debounces queries and aborts the superseded request', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    vi.mocked(searchApi.search).mockImplementation(async (_query, signal) => {
      if (signal) signals.push(signal)
      return { results: [], limit: 20 }
    })
    const { rerender } = renderHook(({ query }) => useGlobalSearch(true, query), { initialProps: { query: 'or' } })

    rerender({ query: 'ord' })
    await act(async () => vi.advanceTimersByTimeAsync(249))
    expect(searchApi.search).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(1))

    expect(searchApi.search).toHaveBeenCalledOnce()
    expect(searchApi.search).toHaveBeenCalledWith('ord', expect.any(AbortSignal))
    rerender({ query: 'order' })
    expect(signals[0].aborted).toBe(true)
  })

  it('loads isolated favorites and recents when the palette opens without a query', async () => {
    vi.mocked(searchApi.preferences)
      .mockResolvedValueOnce([{ type: 'CATALOG', id: '1', title: 'Omiljeno', subtitle: '', url: '/catalog', action: { kind: 'NAVIGATE', label: 'Otvori stavku kataloga', url: '/catalog' }, favorite: true }])
      .mockResolvedValueOnce([])
    const { result } = renderHook(() => useGlobalSearch(true, ''))

    await waitFor(() => expect(result.current.favorites).toHaveLength(1))
    expect(searchApi.preferences).toHaveBeenCalledWith(true, expect.any(AbortSignal))
    expect(searchApi.preferences).toHaveBeenCalledWith(false, expect.any(AbortSignal))
  })
})
