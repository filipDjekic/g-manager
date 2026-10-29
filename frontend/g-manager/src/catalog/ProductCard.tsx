import type { ReactNode } from 'react'
import { Card } from '../components/ui'
import type { CatalogItem } from '../types/catalog.types'
import { CatalogImage } from './CatalogImage'
import { catalogMoney } from './CatalogPresentation.model'

export function ItemMedia({ name, imageUrl, className = '', authenticatedPreview = false }: {
  name: string; imageUrl: string | null; className?: string; authenticatedPreview?: boolean
}) {
  return <div className={className}><CatalogImage key={imageUrl} item={{ type: 'PRODUCT', imageUrl }} authenticatedPreview={authenticatedPreview} alt={name} /></div>
}

export function ProductCard({ product, actions, title, notice, highlighted = false }: {
  product: CatalogItem; actions: ReactNode; title?: ReactNode; notice?: ReactNode; highlighted?: boolean
}) {
  return <Card as="article" padding="none" className={'ui-product-card' + (highlighted ? ' is-highlighted' : '')}>
    <ItemMedia name={product.name} imageUrl={product.imageUrl} className="ui-product-media" authenticatedPreview />
    <div className="ui-product-content"><h3>{title ?? product.name}</h3><p>{product.description || 'Opis proizvoda nije dostupan.'}</p>
      <strong className="ui-product-price">{catalogMoney.format(product.price)}</strong><div className="ui-actions">{actions}</div>{notice && <small>{notice}</small>}
    </div>
  </Card>
}
