import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

export interface MenuAction { label: string; onClick: (trigger: HTMLButtonElement) => void; disabled?: boolean; danger?: boolean }

export function ActionMenu({ label, actions, children = '⋯', disabled, className = '', compact = true }: {
  label: string; actions: MenuAction[]; children?: ReactNode; disabled?: boolean; className?: string; compact?: boolean
}) {
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), id = useId()
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 })
  const [portalContainer, setPortalContainer] = useState<Element | null>(null)
  const close = (restore = false) => { setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }) }
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const anchor = trigger.current.getBoundingClientRect(), rect = menu.current.getBoundingClientRect()
    setPosition({ top: Math.max(8, anchor.bottom + rect.height + 8 <= window.innerHeight ? anchor.bottom + 6 : anchor.top - rect.height - 6),
      left: Math.max(8, Math.min(anchor.right - rect.width, window.innerWidth - rect.width - 8)) })
    menu.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [open])
  useEffect(() => {
    if (!open) return
    const anchor = trigger.current?.getBoundingClientRect()
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false)
    }
    const scroll = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return
      const current = trigger.current?.getBoundingClientRect()
      // Scroll-into-view can deliver its event after the opening click. Keep the
      // menu usable unless the anchor actually moved away from its placement.
      if (!anchor || !current || current.top !== anchor.top || current.left !== anchor.left) setOpen(false)
    }
    const resize = () => setOpen(false)
    document.addEventListener('pointerdown', outside); window.addEventListener('scroll', scroll, true); window.addEventListener('resize', resize)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize) }
  }, [open])
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
    if (event.key === 'Tab') { close(true); return }
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : event.key === 'ArrowUp' ? (current + items.length - 1) % items.length : null
    if (next !== null) { event.preventDefault(); event.stopPropagation(); items[next]?.focus() }
  }
  return <>
    <Button ref={trigger} type="button" variant={compact ? 'ghost' : 'secondary'} iconOnly={compact} size={compact ? 'small' : 'medium'} className={className}
      disabled={disabled || !actions.length} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={event => { setPortalContainer(event.currentTarget.closest('[role="dialog"]') ?? document.body); setOpen(value => !value) }}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setPortalContainer(event.currentTarget.closest('[role="dialog"]') ?? document.body); setOpen(true) } }}>{children}</Button>
    {open && portalContainer && createPortal(<div ref={menu} id={id} role="menu" aria-label={label} className="ui-menu ui-action-menu" style={position} onKeyDown={keyboard}
      onBlur={event => { if (!menu.current?.contains(event.relatedTarget as Node)) setOpen(false) }}>
      {actions.map(action => <button key={action.label} type="button" role="menuitem" tabIndex={-1} disabled={action.disabled} className={action.danger ? 'is-danger' : undefined}
        onClick={() => { const target = trigger.current; close(true); if (target) action.onClick(target) }}>{action.label}</button>)}
    </div>, portalContainer)}
  </>
}
