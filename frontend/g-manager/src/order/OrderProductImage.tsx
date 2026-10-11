import { CatalogImage } from '../catalog/CatalogImage'
import type { ManagedOrderItem } from '../types/order.types'

export function OrderProductImage({ item }: { item: ManagedOrderItem }) {
  return <div className="gm-orders-product-image"><CatalogImage key={item.productImageUrl}
    item={{ type: 'PRODUCT', imageUrl: item.productImageUrl }} /></div>
}
