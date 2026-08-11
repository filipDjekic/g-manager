import type { CatalogItem } from '../types/catalog.types'

export interface CartLine {
  product: CatalogItem
  quantity: number
}

export const CART_DRAFT_VERSION = 1

export function normalizeCartQuantities(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([id, quantity]) => {
    const normalized = typeof quantity === 'number' ? Math.trunc(quantity) : Number.NaN
    return id && normalized > 0 && normalized <= 999 ? [[id, normalized]] : []
  }))
}

export function retainAvailableProducts(quantities: Record<string, number>, productIds: Set<string>) {
  return Object.fromEntries(Object.entries(quantities).filter(([id]) => productIds.has(id)))
}

export function buildCart(
  products: CatalogItem[],
  quantities: Record<string, number>,
): CartLine[] {
  return products
    .filter((product) => (quantities[product.id] ?? 0) > 0)
    .map((product) => ({ product, quantity: quantities[product.id] }))
}

export function calculateEstimatedTotal(cart: CartLine[]) {
  return cart.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0,
  )
}
