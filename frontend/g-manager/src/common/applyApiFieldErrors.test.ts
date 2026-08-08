import { describe, expect, it, vi } from 'vitest'
import { applyApiFieldErrors } from './applyApiFieldErrors'

describe('applyApiFieldErrors', () => {
  it('maps server field errors and focuses the first invalid field', async () => {
    const setError = vi.fn()
    const setFocus = vi.fn()
    const error = {
      isAxiosError: true,
      response: {
        data: {
          fieldErrors: [
            { field: 'email', message: 'Email nije validan' },
            { field: 'password', message: 'Lozinka je prekratka' },
          ],
        },
      },
    }

    expect(applyApiFieldErrors(error, setError, setFocus)).toBe(true)
    expect(setError).toHaveBeenCalledWith('email', {
      type: 'server', message: 'Email nije validan',
    })
    await Promise.resolve()
    expect(setFocus).toHaveBeenCalledWith('email')
  })
})
