import { ProductCard } from './ProductCard'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ActionMenu, Badge, Button, Input, Card } from '../components/ui'
import type { CatalogItem } from '../types/catalog.types'
import { CatalogImage } from './CatalogImage'
import { CatalogIcon } from './CatalogPresentation'
import { catalogDuration, catalogMoney, catalogTypeLabel } from './CatalogPresentation.model'

export type CatalogAction = 'DETAILS' | 'EDIT' | 'IMAGE' | 'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | 'RESTORE'
export interface CatalogPermissions { manage: boolean; remove: boolean; restore: boolean; order: boolean }

export function CatalogOrderLink({ item }: { item: CatalogItem }) {
  return <Link className="ui-button ui-button--secondary ui-button--medium gm-catalog-order-link"
    to={item.type === 'PRODUCT' ? '/my-orders?productId=' + item.id : '/my-reservations?booking=new&serviceId=' + item.id}>
    {item.type === 'PRODUCT' ? 'Dodaj u korpu' : 'Zakaži termin'}</Link>
}

function CatalogActionMenu({ item, permissions, disabled, onAction }: {
  item: CatalogItem; permissions: CatalogPermissions; disabled: boolean
  onAction: (action: CatalogAction, trigger: HTMLButtonElement) => void
}) {
  const actions: { action: CatalogAction; label: string; danger?: boolean }[] = [{ action: 'DETAILS', label: 'Detalji' }]
  if (item.deletedAt) {
    if (permissions.restore) actions.push({ action: 'RESTORE', label: 'Vrati stavku' })
  } else {
    if (permissions.manage) actions.push({ action: 'EDIT', label: 'Izmeni' }, { action: 'IMAGE', label: 'Promeni sliku' },
      { action: item.active ? 'DEACTIVATE' : 'ACTIVATE', label: item.active ? 'Deaktiviraj' : 'Aktiviraj' })
    if (permissions.remove) actions.push({ action: 'DELETE', label: 'Obriši', danger: true })
  }
  return <ActionMenu label={'Akcije za ' + item.name} disabled={disabled} actions={actions.map(({ action, label, danger }) => ({ label, danger, onClick: trigger => onAction(action, trigger) }))} />
}

export function CatalogCard({ item, permissions, selected, highlighted, busy, onSelect, onAction }: {
  item: CatalogItem; permissions: CatalogPermissions; selected: boolean; highlighted: boolean; busy: boolean
  onSelect: () => void; onAction: (item: CatalogItem, action: CatalogAction, trigger: HTMLButtonElement) => void
}) {
  const title = useRef<HTMLButtonElement>(null)
  if (!permissions.manage && item.type === 'PRODUCT') return <ProductCard product={item} highlighted={highlighted}
    title={<Button variant="ghost" onClick={event => onAction(item,'DETAILS',event.currentTarget)}>{item.name}</Button>}
    actions={<>{permissions.order && item.active && !item.deletedAt && <CatalogOrderLink item={item}/>}<Button variant="secondary" onClick={event => onAction(item,'DETAILS',event.currentTarget)}>Detalji</Button></>}/>
  return <Card as="article" padding="none" className={`gm-catalog-card${highlighted ? ' is-highlighted' : ''}${selected ? ' is-selected' : ''}`}
    onClick={event => {
      if (!(event.target as HTMLElement).closest('button, a, input, label') && title.current) onAction(item, 'DETAILS', title.current)
    }}>
    <div className="gm-catalog-card-media">
      <CatalogImage key={item.imageUrl} item={item} />
      {permissions.manage && <div className="gm-catalog-card-status"><Badge tone={item.deletedAt ? 'danger' : item.active ? 'success' : 'neutral'}>
        {item.deletedAt ? 'Obrisano' : item.active ? 'Aktivno' : 'Neaktivno'}</Badge></div>}
      {permissions.manage && !item.deletedAt && <label className="gm-catalog-card-selector">
        <Input type="checkbox" checked={selected} disabled={busy} onChange={onSelect} aria-label={`Izaberi stavku ${item.name}`} />
      </label>}
    </div>
    <div className="gm-catalog-card-body">
      <div className="gm-catalog-card-heading"><span className="gm-catalog-type-label"><CatalogIcon type={item.type} />{catalogTypeLabel(item.type)}</span>
        <CatalogActionMenu item={item} permissions={permissions} disabled={busy} onAction={(action, trigger) => onAction(item, action, trigger)} /></div>
      <h2><Button variant="ghost" ref={title} type="button" className="gm-catalog-title-button" onClick={event => onAction(item, 'DETAILS', event.currentTarget)}>{item.name}</Button></h2>
      <p className="gm-catalog-card-description">{item.description || 'Bez opisa.'}</p>
      <div className="gm-catalog-card-bottom">
        {item.type === 'SERVICE' && item.durationMinutes !== null && <span className="gm-catalog-duration">◷ <span>Trajanje: {catalogDuration(item.durationMinutes)}</span></span>}
        <div className="gm-catalog-price-row"><strong>{catalogMoney.format(item.price)}</strong>
          <Button variant="ghost" type="button" className="gm-catalog-detail-link" aria-label={`Pogledaj detalje: ${item.name}`}
            onClick={event => onAction(item, 'DETAILS', event.currentTarget)}>Detalji <span aria-hidden="true">↗</span></Button></div>
        {permissions.order && item.active && !item.deletedAt && <CatalogOrderLink item={item} />}
      </div>
    </div>
  </Card>
}
