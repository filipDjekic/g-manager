import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDirtyGuard } from './useDirtyGuard'

describe('useDirtyGuard', () => {
  it('blocks unload only while a form is dirty', () => {
    const { rerender } = renderHook(({ dirty }) => useDirtyGuard(dirty), { initialProps: { dirty: false } })
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    rerender({ dirty: true })
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
  })
})
