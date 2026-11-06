import { type SettingsIconKind } from './settingsPresentation.model'

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'


import { Button, Input } from '../components/ui'





export function SettingsIcon({ kind = 'settings' }: { kind?: SettingsIconKind }) {
  const paths: Record<SettingsIconKind, ReactNode> = {
    settings: <><path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 3h3l1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-3H9Z" /><circle cx="12" cy="12" r="3" /></>,
    building: <><path d="M4 21V3h12v18M16 9h4v12M2 21h20M8 7h4M8 11h4M8 15h4" /></>,
    layers: <><path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></>,
    monitor: <><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M12 16v5m-5 0h10" /></>,
    users: <><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6m3 3a6 6 0 0 1 3 5v3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-12 4h2m3 0h2" /></>,
    gamepad: <><path d="M7 7h10c4 0 6 12 3 13-2 1-5-3-5-3H9s-3 4-5 3C1 19 3 7 7 7Z" /><path d="M7 10v5m-2-2h4m6-1h.01m3 2h.01" /></>,
    package: <><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9v10M3 8l9 4 9-4M8 5l9 5" /></>,
    client: <><rect x="3" y="3" width="18" height="14" rx="2" /><path d="M8 21h8m-4-4v4m-5-11 3 3 6-6" /></>,
    plus: <path d="M12 5v14M5 12h14" />, refresh: <path d="M3 10a9 9 0 1 1 1 9M3 4v6h6" />,
    'chevron-left': <path d="m15 5-7 7 7 7" />, 'chevron-right': <path d="m9 5 7 7-7 7" />, 'chevron-down': <path d="m6 9 6 6 6-6" />,
    edit: <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z" />,
    trash: <path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
    check: <path d="m5 12 4 4 10-11" />, close: <path d="m6 6 12 12M6 18 18 6" />,
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[kind]}</svg>
}
export function SettingsSwitch({ label, ariaLabel, checked, disabled, onChange }: { label: string; ariaLabel?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className="gm-settings-switch"><Input type="checkbox" role="switch" aria-label={ariaLabel ?? label} checked={checked} disabled={disabled}
    onChange={event => onChange(event.target.checked)} /><span className="gm-settings-switch-track" aria-hidden="true" /><span>{label}</span></label>
}
export function SettingsAvatar({ name }: { name: string }) {
  return <span className="gm-settings-avatar" aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('sr-Latn-RS') || '?'}</span>
}
export function SettingsActionMenu({ label, actions, disabled }: { label: string; actions: Array<{ label: string; icon?: SettingsIconKind; danger?: boolean; onClick: (opener: HTMLButtonElement | null) => void }>; disabled?: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), id = useId()
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 300 })
  useLayoutEffect(() => {
    if (!open) return
    const locate = () => {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return
      const height = Math.min(menu.current?.scrollHeight ?? 240, window.innerHeight - 24)
      setPosition({ left: Math.max(12, Math.min(rect.right - 228, window.innerWidth - 240)),
        top: window.innerHeight - rect.bottom >= height + 12 ? rect.bottom + 6 : Math.max(12, rect.top - height - 6), maxHeight: height })
    }
    locate(); window.addEventListener('resize', locate)
    return () => window.removeEventListener('resize', locate)
  }, [open])
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false) }
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside); window.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', scroll, true) }
  }, [open])
  return <><Button size="small" iconOnly ref={trigger} type="button" variant="ghost" className="gm-settings-menu-trigger" aria-label={label} disabled={disabled}
    aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>⋯</Button>
    {open && createPortal(<div id={id} ref={menu} role="menu" className="ui-menu gm-settings-menu" aria-label={label} style={position} onKeyDown={event => {
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []), index = items.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus() }
      if (event.key === 'Tab') { setOpen(false); trigger.current?.focus() }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      }
    }}>{actions.map(action => <button key={action.label} type="button" role="menuitem" className={action.danger ? 'is-danger' : ''}
      onClick={() => { setOpen(false); trigger.current?.focus(); action.onClick(trigger.current) }}>{action.icon && <SettingsIcon kind={action.icon} />}{action.label}</button>)}</div>, document.body)}
  </>
}
