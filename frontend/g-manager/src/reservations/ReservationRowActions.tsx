import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { reservationApi } from '../api/reservationApi'
import { Button } from '../components/ui'
import { queryKeys } from '../query/queryKeys'
import type { Reservation, ReservationDetailAction } from '../types/reservation.types'
import { reservationActionLabels } from './ReservationIcon'

export function ReservationRowActions({ reservation, disabled, onAction }: {
  reservation: Reservation; disabled: boolean
  onAction: (reservation: Reservation, action: ReservationDetailAction | undefined, returnTarget: HTMLButtonElement | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 320 })
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const detail = useQuery({ queryKey: queryKeys.reservationDetail(reservation.id),
    queryFn: () => reservationApi.detail(reservation.id), enabled: open, refetchInterval: open ? 15000 : false })
  const value = !detail.error && !detail.isFetching ? detail.data : undefined
  useLayoutEffect(() => {
    if (!open) return
    const locate = () => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const height = Math.min(menu.current?.scrollHeight ?? 320, 320, window.innerHeight - 24)
      const below = window.innerHeight - rect.bottom - 12
      setPosition({ left: Math.max(12, Math.min(rect.right - 240, window.innerWidth - 252)),
        top: below >= height ? rect.bottom + 6 : Math.max(12, rect.top - height - 6), maxHeight: height })
    }
    locate()
    window.addEventListener('resize', locate)
    return () => window.removeEventListener('resize', locate)
  }, [open, detail.data, detail.isFetching])
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
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [open])
  const choose = (action?: ReservationDetailAction) => { setOpen(false); onAction(reservation, action, trigger.current) }
  return <>
    <Button ref={trigger} type="button" variant="secondary" className="reservations-row-menu-trigger" disabled={disabled}
      aria-label={`Akcije rezervacije: ${reservation.customerName ?? 'Klijent'}`} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>⋯</Button>
    {open && createPortal(<div ref={menu} id={id} className="reservations-row-menu" role="menu" aria-label="Akcije rezervacije"
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
      <Button type="button" variant="secondary" role="menuitem" onClick={() => choose()}>Detalji</Button>
      {detail.isFetching && <span role="status">Provera dozvoljenih akcija…</span>}
      {detail.error && <span role="alert">Akcije nije moguće učitati. Otvorite detalje.</span>}
      {value && !value.readOnly && <>
        {value.canEdit && <Button type="button" variant="secondary" role="menuitem" onClick={() => choose('EDIT')}>Izmeni rezervaciju</Button>}
        {value.canAssignResource && value.resourceRequired && !value.resourceId && <Button type="button" variant="secondary" role="menuitem" onClick={() => choose('ASSIGN_RESOURCE')}>Dodeli resurs</Button>}
        {value.allowedActions.map(action => <Button key={action} type="button" role="menuitem"
          variant={action === 'CANCELLED' || action === 'REJECTED' ? 'danger' : 'secondary'} onClick={() => choose(action)}>{reservationActionLabels[action]}</Button>)}
      </>}
      {reservation.readOnly && <span>Samo pregled · upravljanje nije dozvoljeno</span>}
    </div>, document.body)}
  </>
}
