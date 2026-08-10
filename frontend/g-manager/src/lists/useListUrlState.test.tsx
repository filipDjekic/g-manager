import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useListUrlState } from './useListUrlState'

const defaults = { page: '0', status: '', sort: 'createdAt' }
const allowed = ['page', 'status', 'sort'] as const

describe('useListUrlState', () => {
  it('restores allow-listed deep-link state and updates the URL contract', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <MemoryRouter initialEntries={['/?status=READY&page=2&unsafe=ignored']}>{children}</MemoryRouter>
    const { result } = renderHook(() => useListUrlState(defaults, allowed), { wrapper })
    expect(result.current.state).toEqual({ page: '2', status: 'READY', sort: 'createdAt' })
    expect(result.current.queryObject).toEqual({ status: 'READY', page: '2', unsafe: 'ignored' })
    act(() => result.current.apply({ status: 'CREATED', sort: 'createdAt', unsafe: 'no' }))
    expect(result.current.state).toEqual({ page: '0', status: 'CREATED', sort: 'createdAt' })
    expect(result.current.queryObject).toEqual({ status: 'CREATED', sort: 'createdAt' })
  })
})
