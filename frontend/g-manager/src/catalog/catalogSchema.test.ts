import { describe, expect, it } from 'vitest'
import { catalogItemSchema } from './catalogSchema'

describe('catalogItemSchema', () => {
  it('requires duration for a service', () => {
    expect(catalogItemSchema.safeParse({
      name: 'Šišanje',
      type: 'SERVICE',
      price: 1500,
    }).success).toBe(false)
    expect(catalogItemSchema.safeParse({
      name: 'Šišanje',
      type: 'SERVICE',
      price: 1500,
      durationMinutes: 30,
    }).success).toBe(true)
  })

  it('forbids duration for a product', () => {
    expect(catalogItemSchema.safeParse({
      name: 'Šampon',
      type: 'PRODUCT',
      price: 900,
      durationMinutes: 30,
    }).success).toBe(false)
  })
})
