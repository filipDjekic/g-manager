import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../components/ui'
import type { AuthUser } from '../types/auth.types'
import type { ManagedOrder, OrderStatus } from '../types/order.types'
import { canChangeOrder, orderActionLabels, shortOrderId } from './orderPresentation'

export type OrderAction = 'DETAILS' | OrderStatus
export function OrderActionsMenu({ order, user, disabled, onAction }: {
  order: ManagedOrder; user: AuthUser | null; disabled: boolean
  onAction: (action: OrderAction, trigger: HTMLButtonElement) => void
}) {
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 })
  const id = useId()
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return
    const rect = trigger.current.getBoundingClientRect(), height = menu.current.offsetHeight
    setPosition({ top: Math.max(8, rect.bottom + height + 8 > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6),
      left: Math.max(8, Math.min(rect.right - 244, window.innerWidth - 252)) })
    menu.current.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false)
    }
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false) }
    const resize = () => setOpen(false)
    document.addEventListener('pointerdown', outside); document.addEventListener('scroll', scroll, true); window.addEventListener('resize', resize)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize) }
  }, [open])
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); return }
    if (event.key === 'Tab') { setOpen(false); trigger.current?.focus(); return }
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown'
      ? (current + 1) % items.length : event.key === 'ArrowUp' ? (current + items.length - 1) % items.length : null
    if (next !== null) { event.preventDefault(); items[next]?.focus() }
  }
  function choose(action: OrderAction) {
    setOpen(false); trigger.current?.focus()
    if (trigger.current) onAction(action, trigger.current)
  }
  return <>
    <Button ref={trigger} type="button" variant="secondary" className="gm-orders-menu-trigger" disabled={disabled}
      aria-label={`Akcije za narudžbinu ${shortOrderId(order.id)}`} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={() => setOpen(!open)} onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true) }
      }}>⋯</Button>
    {open && createPortal(<div ref={menu} role="menu" id={id} className="gm-orders-action-menu" style={position}
      aria-label={`Narudžbina ${shortOrderId(order.id)}`} onKeyDown={keyboard}>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => choose('DETAILS')}>Detalji</button>
      {(['IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'] as const).filter(status => canChangeOrder(order, status, user)).map(status =>
        <button key={status} type="button" role="menuitem" tabIndex={-1} disabled={disabled}
          className={status === 'CANCELLED' ? 'gm-orders-action-danger' : ''} onClick={() => choose(status)}>{orderActionLabels[status]}</button>)}
    </div>, document.body)}
  </>
}
