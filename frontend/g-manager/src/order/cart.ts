import type { CatalogItem } from '../types/catalog.types'

export interface CartLine {
  product: CatalogItem
  quantity: number
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
