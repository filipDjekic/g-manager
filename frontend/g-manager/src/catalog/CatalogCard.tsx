import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Badge, Button } from '../components/ui'
import type { CatalogItem } from '../types/catalog.types'
import { CatalogImage } from './CatalogImage'
import { CatalogIcon, catalogDuration, catalogMoney, catalogTypeLabel } from './CatalogPresentation'

export type CatalogAction = 'DETAILS' | 'EDIT' | 'IMAGE' | 'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | 'RESTORE'
export interface CatalogPermissions { manage: boolean; remove: boolean; restore: boolean; order: boolean }

export function CatalogOrderLink({ item }: { item: CatalogItem }) {
  return <Link className="ui-button ui-button--secondary gm-catalog-order-link"
    to={item.type === 'PRODUCT' ? '/my-orders' : '/my-reservations'}
    onClick={() => sessionStorage.setItem('gmanager.catalog-selection', item.id)}>
    {item.type === 'PRODUCT' ? 'Dodaj u korpu' : 'Zakaži termin'}</Link>
}

function CatalogActionMenu({ item, permissions, disabled, onAction }: {
  item: CatalogItem; permissions: CatalogPermissions; disabled: boolean
  onAction: (action: CatalogAction, trigger: HTMLButtonElement) => void
}) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 })
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const actions: { action: CatalogAction; label: string; danger?: boolean }[] = [{ action: 'DETAILS', label: 'Detalji' }]
  if (item.deletedAt) {
    if (permissions.restore) actions.push({ action: 'RESTORE', label: 'Vrati stavku' })
  } else {
    if (permissions.manage) actions.push({ action: 'EDIT', label: 'Izmeni' }, { action: 'IMAGE', label: 'Promeni sliku' },
      { action: item.active ? 'DEACTIVATE' : 'ACTIVATE', label: item.active ? 'Deaktiviraj' : 'Aktiviraj' })
    if (permissions.remove) actions.push({ action: 'DELETE', label: 'Obriši', danger: true })
  }
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const rect = trigger.current.getBoundingClientRect(), height = menu.current.offsetHeight
    setPosition({ left: Math.max(8, Math.min(rect.right - 208, window.innerWidth - 216)),
      top: Math.max(8, rect.bottom + height + 8 > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6) })
    menu.current.querySelector<HTMLButtonElement>('button')?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false)
    }
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false) }
    const resize = () => setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', resize)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize) }
  }, [open])
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); return }
    if (event.key === 'Tab') { setOpen(false); trigger.current?.focus(); return }
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index + items.length - 1) % items.length : null
    if (next !== null) { event.preventDefault(); items[next]?.focus() }
  }
  return <>
    <Button ref={trigger} type="button" variant="secondary" className="gm-catalog-menu-trigger" disabled={disabled}
      aria-label={`Akcije za ${item.name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(!open)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) }
      }}>⋯</Button>
    {open && createPortal(<div ref={menu} id={id} role="menu" aria-label={`Akcije za ${item.name}`}
      className="gm-catalog-action-menu" style={position} onKeyDown={keyboard}>
      {actions.map(({ action, label, danger }) => <button key={action} type="button" role="menuitem" disabled={disabled}
        className={danger ? 'gm-catalog-menu-danger' : ''} onClick={() => {
          setOpen(false); trigger.current?.focus(); if (trigger.current) onAction(action, trigger.current)
        }}>{label}</button>)}
    </div>, document.body)}
  </>
}

export function CatalogCard({ item, permissions, selected, highlighted, busy, onSelect, onAction }: {
  item: CatalogItem; permissions: CatalogPermissions; selected: boolean; highlighted: boolean; busy: boolean
  onSelect: () => void; onAction: (item: CatalogItem, action: CatalogAction, trigger: HTMLButtonElement) => void
}) {
  const title = useRef<HTMLButtonElement>(null)
  return <article className={`gm-catalog-card${highlighted ? ' is-highlighted' : ''}${selected ? ' is-selected' : ''}`}
    onClick={event => {
      if (!(event.target as HTMLElement).closest('button, a, input, label') && title.current) onAction(item, 'DETAILS', title.current)
    }}>
    <div className="gm-catalog-card-media">
      <CatalogImage key={item.imageUrl} item={item} />
      <div className="gm-catalog-card-status"><Badge tone={item.deletedAt ? 'danger' : item.active ? 'success' : 'neutral'}>
        {item.deletedAt ? 'Obrisano' : item.active ? 'Aktivno' : 'Neaktivno'}</Badge></div>
      {permissions.manage && !item.deletedAt && <label className="gm-catalog-card-selector">
        <input type="checkbox" checked={selected} disabled={busy} onChange={onSelect} aria-label={`Izaberi stavku ${item.name}`} />
      </label>}
    </div>
    <div className="gm-catalog-card-body">
      <div className="gm-catalog-card-heading"><span className="gm-catalog-type-label"><CatalogIcon type={item.type} />{catalogTypeLabel(item.type)}</span>
        <CatalogActionMenu item={item} permissions={permissions} disabled={busy} onAction={(action, trigger) => onAction(item, action, trigger)} /></div>
      <h2><button ref={title} type="button" className="gm-catalog-title-button" onClick={event => onAction(item, 'DETAILS', event.currentTarget)}>{item.name}</button></h2>
      <p className="gm-catalog-card-description">{item.description || 'Bez opisa.'}</p>
      <div className="gm-catalog-card-bottom">
        {item.type === 'SERVICE' && item.durationMinutes !== null && <span className="gm-catalog-duration">◷ <span>Trajanje: {catalogDuration(item.durationMinutes)}</span></span>}
        <div className="gm-catalog-price-row"><strong>{catalogMoney.format(item.price)}</strong>
          <button type="button" className="gm-catalog-detail-link" aria-label={`Pogledaj detalje: ${item.name}`}
            onClick={event => onAction(item, 'DETAILS', event.currentTarget)}>Detalji <span aria-hidden="true">↗</span></button></div>
        {permissions.order && item.active && !item.deletedAt && <CatalogOrderLink item={item} />}
      </div>
    </div>
  </article>
}
