import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, Select, TableShell } from '../components/ui'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { CustomerListItem } from '../types/customer.types'

export const customerDate = (value: string) => formatBusinessDateTime(value, false, 'sr-Latn-RS')
export const customerMoney = new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency: 'RSD' })

export function CustomerAvatar({ name, large = false }: { name: string; large?: boolean }) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const initials = [parts[0]?.[0], parts.length > 1 ? parts.at(-1)?.[0] : ''].join('').toLocaleUpperCase('sr-Latn-RS')
  return <span className={`customers-avatar${large ? ' customers-avatar--large' : ''}`} aria-hidden="true">{initials || '?'}</span>
}

export type CustomerAction = 'PROFILE' | 'EDIT' | 'START' | 'DEACTIVATE'
type ActionHandler = (customer: CustomerListItem, action: CustomerAction, opener: HTMLButtonElement | null) => void

function CustomerRowActions({ customer, canEdit, canStart, canDeactivate, disabled, onAction }: {
  customer: CustomerListItem; canEdit: boolean; canStart: boolean; canDeactivate: boolean
  disabled: boolean; onAction: ActionHandler
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 300 })
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const user = useAuthStore(state => state.user)
  const canReadGaming = hasCapability(user, 'GAMING_SESSION_READ')
  const visits = useQuery({ queryKey: ['gaming-visits', 'customer', customer.id],
    queryFn: () => gamingSessionApi.customerVisits(customer.id),
    enabled: open && canStart && customer.active && canReadGaming })
  const activeSession = visits.data?.some(visit => visit.status === 'ACTIVE')
  useLayoutEffect(() => {
    if (!open) return
    const locate = () => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const height = Math.min(menu.current?.scrollHeight ?? 300, window.innerHeight - 24)
      setPosition({ left: Math.max(12, Math.min(rect.right - 240, window.innerWidth - 252)),
        top: window.innerHeight - rect.bottom - 12 >= height ? rect.bottom + 6 : Math.max(12, rect.top - height - 6),
        maxHeight: height })
    }
    locate()
    window.addEventListener('resize', locate)
    return () => window.removeEventListener('resize', locate)
  }, [open, visits.data, visits.isFetching, visits.error])
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
    }
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [open])
  const choose = (action: CustomerAction) => {
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
    onAction(customer, action, trigger.current)
  }
  return <>
    <Button ref={trigger} type="button" variant="secondary" className="customers-menu-trigger" disabled={disabled}
      aria-label={`Akcije za klijenta ${customer.name}`} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>⋯</Button>
    {open && createPortal(<div ref={menu} id={id} className="customers-row-menu" role="menu" aria-label="Akcije klijenta"
      style={position} onKeyDown={event => {
        if (event.key === 'Tab') { setOpen(false); trigger.current?.focus(); return }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
        const current = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus()
      }}>
      <Button type="button" variant="secondary" role="menuitem" onClick={() => choose('PROFILE')}>Prikaži profil</Button>
      {canEdit && <Button type="button" variant="secondary" role="menuitem" onClick={() => choose('EDIT')}>Izmeni podatke</Button>}
      {canStart && customer.active && canReadGaming && visits.isFetching && <span role="status">Provera gaming sesija…</span>}
      {canStart && customer.active && (!canReadGaming || visits.data && !visits.error && !activeSession) &&
        <Button type="button" variant="secondary" role="menuitem" disabled={visits.isFetching} onClick={() => choose('START')}>Pokreni gaming sesiju</Button>}
      {canStart && customer.active && activeSession && <span>Gaming sesija je već aktivna.</span>}
      {canStart && customer.active && visits.error && <span role="alert">Gaming sesije nije moguće proveriti. Otvorite profil.</span>}
      {canDeactivate && customer.active && <Button type="button" variant="danger" role="menuitem" onClick={() => choose('DEACTIVATE')}>Deaktiviraj klijenta</Button>}
    </div>, document.body)}
  </>
}

export function CustomerTable({ customers, selectedId, canEdit, canStart, canDeactivate, disabled, onAction }: {
  customers: CustomerListItem[]; selectedId: string; canEdit: boolean; canStart: boolean
  canDeactivate: boolean; disabled: boolean; onAction: ActionHandler
}) {
  return <TableShell label="Lista klijenata"><table className="data-table customers-table responsive-table">
    <thead><tr>{['Klijent', 'Email', 'Broj rezervacija', 'Poslednja aktivnost', 'Status', 'Akcije'].map(label =>
      <th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{customers.map(customer => <tr key={customer.id} className={selectedId === customer.id ? 'is-selected' : ''}
      onClick={event => {
        if ((event.target as HTMLElement).closest('button, a, input, select')) return
        onAction(customer, 'PROFILE', event.currentTarget.querySelector<HTMLButtonElement>('.customers-name'))
      }}>
      <td data-label="Klijent"><div className="customers-identity"><CustomerAvatar name={customer.name} />
        <Button type="button" variant="secondary" className="customers-name" aria-label={`Prikaži profil: ${customer.name}`}
          onClick={event => onAction(customer, 'PROFILE', event.currentTarget)}>{customer.name}</Button></div></td>
      <td data-label="Email"><span className="customers-email">{customer.email}</span></td>
      <td data-label="Broj rezervacija"><strong className="customers-number">{customer.reservationCount}</strong></td>
      <td data-label="Poslednja aktivnost">{customer.lastActivityAt ? customerDate(customer.lastActivityAt) : 'Nema aktivnosti'}</td>
      <td data-label="Status"><Badge tone={customer.active ? 'success' : 'neutral'}>{customer.active ? 'Aktivan' : 'Neaktivan'}</Badge></td>
      <td data-label="Akcije"><CustomerRowActions customer={customer} canEdit={canEdit} canStart={canStart}
        canDeactivate={canDeactivate} disabled={disabled} onAction={onAction} /></td>
    </tr>)}</tbody>
  </table></TableShell>
}

export function CustomersPagination({ page, size, totalElements, totalPages, loading, onPageChange, onSizeChange }: {
  page: number; size: number; totalElements: number; totalPages: number; loading: boolean
  onPageChange: (page: number) => void; onSizeChange: (size: string) => void
}) {
  const pages = Math.max(totalPages, 1)
  const start = Math.max(0, Math.min(page - 1, pages - 3))
  const visible = [...new Set([0, ...Array.from({ length: Math.min(3, pages) }, (_, index) => start + index), pages - 1])]
    .sort((first, second) => first - second)
  return <div className="customers-pagination">
    <div className="customers-pagination-info"><span aria-live="polite">Prikazano {totalElements && page * size < totalElements ? page * size + 1 : 0}–{Math.min((page + 1) * size, totalElements)} od {totalElements} klijenata</span>
      <label><span className="sr-only">Klijenata po stranici</span><Select value={size} disabled={loading}
        onChange={event => onSizeChange(event.target.value)}>{[10, 20, 50].map(value => <option key={value} value={value}>{value} po stranici</option>)}</Select></label></div>
    <nav aria-label="Stranice klijenata">
      <Button type="button" variant="secondary" disabled={loading || page <= 0} onClick={() => onPageChange(page - 1)}>Prethodna</Button>
      {visible.map((number, index) => <span className="customers-page-number" key={number}>
        {index > 0 && number - visible[index - 1] > 1 && <span aria-hidden="true">…</span>}
        <Button type="button" variant="secondary" disabled={loading} aria-label={`Stranica ${number + 1}`}
          aria-current={page === number ? 'page' : undefined} onClick={() => onPageChange(number)}>{number + 1}</Button>
      </span>)}
      <Button type="button" variant="secondary" disabled={loading || page + 1 >= pages} onClick={() => onPageChange(page + 1)}>Sledeća</Button>
    </nav>
  </div>
}
