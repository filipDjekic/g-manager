import { ItemMedia } from '../catalog/ProductCard'
import type { ManagedOrderItem } from '../types/order.types'

export function OrderProductImage({ item }: { item: ManagedOrderItem }) {
  return <ItemMedia name={item.productName ?? 'Proizvod'} imageUrl={item.productImageUrl} className="gm-orders-product-image" />
}
