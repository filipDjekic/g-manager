import { describe, expect, it } from 'vitest'
import { userFacingApiError } from './errorMessage'

describe('API error hardening', () => {
  it('turns conflicts into explicit refresh-and-retry guidance', () => {
    expect(userFacingApiError(409, 'Resource changed', 'req-1', 'Failed'))
      .toBe('Resource changed Osvežite podatke pre ponovnog pokušaja. (ID zahteva: req-1)')
  })

  it('does not expose server messages for unexpected failures', () => {
    expect(userFacingApiError(500, 'database detail', 'req-2', 'Operacija nije uspela.'))
      .toBe('Operacija nije uspela. (ID zahteva: req-2)')
  })
})
