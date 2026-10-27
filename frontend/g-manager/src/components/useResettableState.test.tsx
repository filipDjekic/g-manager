import { useLayoutEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useResettableState } from './useResettableState'

describe('navigation-scoped local state', () => {
  it('keeps an edited draft during refresh and clears it before the next route commits', () => {
    const commits: string[] = []
    function Draft({ route }: { route: string }) {
      const [value, setValue] = useResettableState(() => '', route)
      useLayoutEffect(() => { commits.push(`${route}:${value}`) }, [route, value])
      return <input aria-label="Draft" value={value} onChange={event => setValue(event.target.value)} />
    }
    const { rerender } = render(<Draft route="first" />)
    fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'edited' } })
    rerender(<Draft route="first" />)
    expect(screen.getByLabelText('Draft')).toHaveValue('edited')
    rerender(<Draft route="second" />)
    expect(screen.getByLabelText('Draft')).toHaveValue('')
    expect(commits).not.toContain('second:edited')
  })
})
