import { describe, expect, it } from 'vitest'
import { buildCart, calculateEstimatedTotal } from './cart'
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
})
