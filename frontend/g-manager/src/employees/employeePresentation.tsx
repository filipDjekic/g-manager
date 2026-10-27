import { useObjectUrl } from '../components/useObjectUrl'
import { useResettableState } from '../components/useResettableState'
import { employeeDate, type EmployeeAction } from './employeePresentation.model'
import { Pagination } from '../components/ui'
import { useQuery } from '@tanstack/react-query'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { userApi } from '../api/userApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, Skeleton } from '../components/ui'
import { roleLabels } from '../components/ui/statusPresentation'

import type { UserResponse } from '../types/user.types'

export function EmployeeIcon({ kind = 'users' }: { kind?: 'users' | 'add' | 'check' | 'calendar' | 'leave' | 'search' | 'profile' | 'location' | 'resource' | 'lock' | 'delete' | 'eye' | 'eye-off' | 'refresh' }) {
  const paths = {
    users: <><path d="M18 21a8 8 0 0 0-16 0M22 20a6 6 0 0 0-4-5.65" /><circle cx="10" cy="8" r="5" /><path d="M17 3.13a5 5 0 0 1 0 9.74" /></>,
    add: <><circle cx="9" cy="8" r="5" /><path d="M17 21a8 8 0 0 0-16 0M20 8v6M17 11h6" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18m-13 5 2 2 5-4" /></>,
    leave: <><path d="M8 3v3M16 3v3M3 10h18" /><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 15h8" /></>,
    search: <><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    location: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    resource: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4M8 21h8" /></>,
    lock: <><rect x="4" y="10" width="16" height="12" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3" /></>,
    delete: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
    eye: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    'eye-off': <><path d="m3 3 18 18M10.5 5.1A11 11 0 0 1 22 12a15 15 0 0 1-3 4M6.5 6.5A15 15 0 0 0 2 12s3 7 10 7a12 12 0 0 0 5-1M10 10a3 3 0 0 0 4 4" /></>,
    refresh: <><path d="M20 7V3m0 4h-4M4 17v4m0-4h4M20 7a9 9 0 0 0-15 0M4 17a9 9 0 0 0 15 0" /></>,
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[kind]}</svg>
}

export function EmployeeAvatar({ employee, large = false }: { employee: Pick<UserResponse, 'id' | 'name' | 'avatarUrl'>; large?: boolean }) {
  return <Avatar key={`${employee.id}:${employee.avatarUrl}`} employee={employee} large={large} />
}
function Avatar({ employee, large }: { employee: Pick<UserResponse, 'name' | 'avatarUrl'>; large: boolean }) {
  const user = useAuthStore(state => state.user)
  const [failed, setFailed] = useResettableState(() => false, employee.avatarUrl ?? '')
  const documentId = /^\/api\/v1\/documents\/([\w-]+)\/content(?:\?|$)/.exec(employee.avatarUrl ?? '')?.[1]
  const content = useQuery({ queryKey: ['employee-avatars', user?.id, documentId],
    queryFn: ({ signal }) => userApi.avatarPreview(documentId!, signal),
    enabled: Boolean(documentId) && hasCapability(user, 'USER_LIST'), staleTime: 60000, gcTime: 60000, retry: false })
  const source = useObjectUrl(content.data)
  const parts = employee.name.trim().split(/\s+/).filter(Boolean)
  const initials = [parts[0]?.[0], parts.length > 1 ? parts.at(-1)?.[0] : ''].join('').toLocaleUpperCase('sr-Latn-RS') || '?'
  const image = documentId ? source : employee.avatarUrl
  return <span className={`gm-employee-avatar${large ? ' gm-employee-avatar--large' : ''}`} aria-hidden="true">
    {image && !failed && !content.error ? <img src={image} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : initials}
  </span>
}

export function EmployeeKpi({ title, value, kind, tone, description, loading }: {
  title: string; value: number | undefined; kind: Parameters<typeof EmployeeIcon>[0]['kind']
  tone: 'blue' | 'green' | 'purple' | 'pink'; description: string; loading: boolean
}) {
  return <section className={`ui-card gm-employee-kpi gm-employee-kpi--${tone}`} aria-label={title}>
    <span className="gm-employee-kpi-icon"><EmployeeIcon kind={kind} /></span><div><h2>{title}</h2>
      {loading ? <Skeleton lines={1} label={`Učitavanje: ${title}`} /> : <strong>{value === undefined ? '—' : new Intl.NumberFormat('sr-Latn-RS').format(value)}</strong>}
      <p>{description}</p></div>
  </section>
}
export function EmployeeActionsMenu({ employee, canDeactivate, canDelete, disabled, onAction }: {
  employee: UserResponse; canDeactivate: boolean; canDelete: boolean; disabled: boolean
  onAction: (employee: UserResponse, action: EmployeeAction, opener: HTMLButtonElement | null) => void
}) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 300 })
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), id = useId()
  useLayoutEffect(() => {
    if (!open) return
    const locate = () => {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return
      const height = Math.min(menu.current?.scrollHeight ?? 200, window.innerHeight - 24)
      setPosition({ left: Math.max(12, Math.min(rect.right - 224, window.innerWidth - 236)),
        top: window.innerHeight - rect.bottom - 12 >= height ? rect.bottom + 6 : Math.max(12, rect.top - height - 6), maxHeight: height })
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
  const choose = (action: EmployeeAction) => { setOpen(false); onAction(employee, action, trigger.current) }
  return <><Button ref={trigger} type="button" variant="secondary" className="gm-employee-menu-trigger" disabled={disabled}
    aria-label={`Akcije za ${employee.name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
    onClick={() => setOpen(value => !value)}>⋯</Button>
    {open && createPortal(<div ref={menu} id={id} className="gm-employee-menu" role="menu" aria-label={`Akcije za ${employee.name}`} style={position}
      onKeyDown={event => {
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
        if (event.key === 'Tab') { setOpen(false); trigger.current?.focus() }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
        }
      }}>
      <button type="button" role="menuitem" onClick={() => choose('profile')}><EmployeeIcon kind="profile" />Prikaži profil</button>
      {canDeactivate && <button type="button" role="menuitem" onClick={() => choose('deactivate')}><EmployeeIcon kind="lock" />Deaktiviraj nalog</button>}
      {canDelete && <button type="button" role="menuitem" className="is-danger" onClick={() => choose('delete')}><EmployeeIcon kind="delete" />Obriši nalog</button>}
    </div>, document.body)}</>
}

export function EmployeesTable({ employees, actorId, focus, selected, canDeactivate, canDelete, busy, onToggle, onAction }: {
  employees: UserResponse[]; actorId: string; focus: string; selected: Set<string>; canDeactivate: boolean; canDelete: boolean; busy: boolean
  onToggle: (id: string) => void; onAction: (employee: UserResponse, action: EmployeeAction, opener: HTMLButtonElement | null) => void
}) {
  return <div className="gm-employees-table-shell"><table className="gm-employees-table" role="table"><thead><tr>
    {canDeactivate && <th scope="col" className="gm-employee-selection-col"><span className="sr-only">Izbor</span></th>}
    {['Zaposleni', 'Uloga', 'Kontakt', 'Status', 'Datum registracije', 'Akcije'].map(label => <th scope="col" key={label}>{label}</th>)}
  </tr></thead><tbody>{employees.map(employee => <tr key={employee.id} className={focus === employee.id ? 'is-selected' : undefined}>
    {canDeactivate && <td className="gm-employee-selection-col" data-label="Izbor"><input type="checkbox" checked={selected.has(employee.id)}
      disabled={busy || !employee.active || employee.id === actorId} aria-label={`Izaberi zaposlenog ${employee.name}`} onChange={() => onToggle(employee.id)} /></td>}
    <td data-label="Zaposleni"><button type="button" className="gm-employee-name-button" aria-pressed={focus === employee.id}
      onClick={event => onAction(employee, 'profile', event.currentTarget)}><EmployeeAvatar employee={employee} />
      <span><strong>{employee.name}</strong><small>Profil zaposlenog</small></span></button></td>
    <td data-label="Uloga"><Badge tone="info">{roleLabels[employee.role]}</Badge></td>
    <td data-label="Kontakt"><a href={`mailto:${employee.email}`}>{employee.email}</a></td>
    <td data-label="Status"><Badge tone={employee.active ? 'success' : 'neutral'}>{employee.active ? 'Aktivan' : 'Neaktivan'}</Badge></td>
    <td data-label="Registracija"><time dateTime={employee.createdAt}>{employeeDate(employee.createdAt)}</time></td>
    <td data-label="Akcije"><div className="gm-employee-row-actions"><Button type="button" variant="secondary" className="gm-employee-details-button"
      onClick={event => onAction(employee, 'profile', event.currentTarget)}>Detalji</Button>
      <EmployeeActionsMenu employee={employee} disabled={busy} canDeactivate={canDeactivate && employee.active && employee.id !== actorId}
        canDelete={canDelete && employee.id !== actorId} onAction={onAction} /></div></td>
  </tr>)}</tbody></table></div>
}

export function EmployeePagination({ page, size, totalPages, totalElements, busy, onPage, onSize }: {
  page: number; size: number; totalPages: number; totalElements: number; busy: boolean
  onPage: (value: number) => void; onSize: (value: number) => void
}) {
  return <Pagination numbered label="Stranice zaposlenih" page={page} pageSize={size} totalPages={totalPages}
    totalElements={totalElements} loading={busy} onPageChange={onPage} onPageSizeChange={onSize} />
}
