import { describe, expect, it } from 'vitest'
import { buildCart, calculateEstimatedTotal, normalizeCartQuantities, retainAvailableProducts } from './cart'
import type { CatalogItem } from '../types/catalog.types'

describe('order cart totals', () => {
  it('uses read-only catalog prices for the customer estimate', () => {
    const products = [
      { id: 'one', price: 125.5 },
      { id: 'two', price: 49.25 },
    ] as CatalogItem[]
    const cart = buildCart(products, { one: 2, two: 3 })
    expect(calculateEstimatedTotal(cart)).toBe(398.75)
  })

  it('normalizes persisted quantities and removes unavailable products', () => {
    expect(normalizeCartQuantities({ one: 2.9, zero: 0, negative: -1, huge: 1000, invalid: '2' }))
      .toEqual({ one: 2 })
    expect(retainAvailableProducts({ one: 2, inactive: 1 }, new Set(['one']))).toEqual({ one: 2 })
  })
})
