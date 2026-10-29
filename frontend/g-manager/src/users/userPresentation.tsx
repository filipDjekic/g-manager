import { type IconKind, userDate, allowedUserActions, type UserAction, type ActionHandler } from './userPresentation.model'
import { Pagination, Input, TableShell, Button, StatCard, Badge, Skeleton } from '../components/ui'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'


import { roleLabels } from '../components/ui/statusPresentation'
import { EmployeeAvatar, EmployeeIcon } from '../employees/employeePresentation'

import type { AuthUser, Permission, Role } from '../types/auth.types'
import type { UserResponse } from '../types/user.types'
export function UserIcon({ kind = 'users' }: { kind?: IconKind }) {
  if (kind !== 'shield' && kind !== 'crown' && kind !== 'restore') return <EmployeeIcon kind={kind} />
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === 'shield' ? <path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6" /> : kind === 'crown'
      ? <path d="m2 8 5 4 5-8 5 8 5-4-3 12H5L2 8Zm4 15h12" /> : <><path d="M3 10V4m0 6h6M3 10a9 9 0 1 1 1 9" /><path d="M12 8v5l3 2" /></>}
  </svg>
}
export function UserAvatar({ user, large = false }: { user: UserResponse; large?: boolean }) {
  return <span className={`gm-user-avatar${large ? ' gm-user-avatar--large' : ''}`}><EmployeeAvatar employee={user} large={large} /></span>
}
export function UserRoleBadge({ role }: { role: Role }) {
  return <span className={`gm-user-role gm-user-role--${role.toLowerCase()}`}><Badge tone={role === 'OWNER' ? 'warning' : role === 'ADMIN' ? 'accent' : role === 'EMPLOYEE' ? 'info' : 'neutral'}>
    <UserIcon kind={role === 'OWNER' ? 'crown' : role === 'ADMIN' ? 'shield' : 'profile'} />{roleLabels[role]}</Badge></span>
}
export function UserStatus({ user }: { user: UserResponse }) {
  return <Badge tone={user.deletedAt ? 'warning' : user.active ? 'success' : 'neutral'}>{user.deletedAt ? 'Obrisan' : user.active ? 'Aktivan' : 'Neaktivan'}</Badge>
}
export function UserKpi({ title, value, kind, tone, loading }: {
  title: string; value: number | undefined; kind: IconKind; tone: 'blue' | 'green' | 'purple' | 'pink'; loading: boolean
}) {
  return <StatCard label={<>{title}</>} value={loading ? <Skeleton lines={1} label={`Učitavanje: ${title}`} /> : <>{value === undefined ? '—' : new Intl.NumberFormat('sr-Latn-RS').format(value)}</>} icon={<UserIcon kind={kind} />} tone={tone} aria-label={title} />
}
function UserRowMenu({ user, actor, busy, onAction }: { user: UserResponse; actor: AuthUser; busy: boolean; onAction: ActionHandler }) {
  const permissions = allowedUserActions(actor, user), id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 300 })
  useLayoutEffect(() => {
    if (!open) return
    const locate = () => {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return
      const height = Math.min(menu.current?.scrollHeight ?? 220, window.innerHeight - 24)
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
  const choose = (action: UserAction) => { setOpen(false); onAction(user, action, trigger.current) }
  return <><Button size="small" iconOnly ref={trigger} type="button" variant="ghost" className="gm-user-menu-trigger" disabled={busy} aria-label={`Akcije za ${user.name}`}
    aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>⋯</Button>
    {open && createPortal(<div ref={menu} id={id} className="ui-menu gm-user-menu" style={position} role="menu" aria-label={`Akcije za ${user.name}`} onKeyDown={event => {
      const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus() }
      if (event.key === 'Tab') { setOpen(false); trigger.current?.focus() }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }
    }}>
      <button type="button" role="menuitem" onClick={() => choose('details')}><UserIcon kind="profile" />Prikaži detalje</button>
      {permissions.deactivate && <button type="button" role="menuitem" onClick={() => choose('deactivate')}><UserIcon kind="lock" />Deaktiviraj nalog</button>}
      {permissions.remove && <button type="button" role="menuitem" className="is-danger" onClick={() => choose('delete')}><UserIcon kind="delete" />Obriši nalog</button>}
      {permissions.restore && <button type="button" role="menuitem" onClick={() => choose('restore')}><UserIcon kind="restore" />Vrati nalog</button>}
    </div>, document.body)}</>
}
export function UsersTable({ users, actor, selected, focus, busy, onToggle, onAction }: {
  users: UserResponse[]; actor: AuthUser; selected: Set<string>; focus: string; busy: boolean; onToggle: (id: string) => void; onAction: ActionHandler
}) {
  return <TableShell label="Tabelarni pregled" className="gm-users-table-shell"><table className="ui-data-table gm-users-table" role="table"><thead><tr>
    <th scope="col" className="gm-user-selection"><span className="sr-only">Izbor</span></th>
    {['Korisnik', 'Email', 'Uloga', 'Status', 'Kreiran', 'Akcije'].map(label => <th scope="col" key={label}>{label}</th>)}
  </tr></thead><tbody>{users.map(user => <tr key={user.id} className={focus === user.id ? 'is-selected' : undefined}>
    <td className="gm-user-selection" data-label="Izbor"><Input type="checkbox" checked={selected.has(user.id)} disabled={busy || !allowedUserActions(actor, user).deactivate}
      aria-label={`Izaberi korisnika ${user.name}`} onChange={() => onToggle(user.id)} /></td>
    <td data-label="Korisnik"><Button variant="ghost" type="button" className="gm-user-name-button" aria-pressed={focus === user.id} onClick={event => onAction(user, 'details', event.currentTarget)}>
      <UserAvatar user={user} /><span><strong>{user.name}</strong><small>Detalji naloga</small></span></Button></td>
    <td data-label="Email"><a href={`mailto:${user.email}`}>{user.email}</a></td><td data-label="Uloga"><UserRoleBadge role={user.role} /></td>
    <td data-label="Status"><UserStatus user={user} /></td><td data-label="Kreiran"><time dateTime={user.createdAt}>{userDate(user.createdAt)}</time></td>
    <td data-label="Akcije"><div className="gm-user-row-actions"><Button iconOnly type="button" variant="secondary" className="gm-user-detail-button" aria-label={`Detalji za ${user.name}`}
      onClick={event => onAction(user, 'details', event.currentTarget)}><UserIcon kind="profile" /><span>Detalji</span></Button><UserRowMenu user={user} actor={actor} busy={busy} onAction={onAction} /></div></td>
  </tr>)}</tbody></table></TableShell>
}
export function UserPagination({ page, size, totalPages, totalElements, busy, onPage, onSize }: {
  page: number; size: number; totalPages: number; totalElements: number; busy: boolean
  onPage: (value: number) => void; onSize: (value: number) => void
}) {
  return <Pagination numbered label="Stranice korisnika" page={page} pageSize={size} totalPages={totalPages}
    totalElements={totalElements} loading={busy} onPageChange={onPage} onPageSizeChange={onSize} />
}

const permissionLabels: Record<Permission, string> = {
  PROFILE_READ: 'Pregled ličnog naloga', PROFILE_UPDATE: 'Izmena ličnog naloga', EMPLOYEE_LIST: 'Pregled zaposlenih',
  USER_LIST: 'Pregled korisnika', USER_CREATE: 'Kreiranje korisnika', USER_DEACTIVATE: 'Deaktivacija korisnika', USER_DELETE: 'Brisanje korisnika', USER_RESTORE: 'Vraćanje korisnika',
  CUSTOMER_READ: 'Pregled klijenata', CUSTOMER_CREATE: 'Dodavanje klijenata', CUSTOMER_UPDATE_LIMITED: 'Izmena podataka klijenata', CUSTOMER_DEACTIVATE: 'Deaktivacija klijenata', CUSTOMER_CRM_MANAGE: 'Upravljanje podacima i beleškama klijenata',
  CATALOG_READ: 'Pregled kataloga', CATALOG_MANAGE: 'Upravljanje katalogom', CATALOG_DELETE: 'Brisanje stavki kataloga', CATALOG_RESTORE: 'Vraćanje stavki kataloga', AUDIT_READ: 'Pregled revizijske evidencije',
  WORKING_HOURS_READ: 'Pregled radnog vremena', WORKING_HOURS_MANAGE: 'Upravljanje radnim vremenom i odsustvima', RESOURCE_READ: 'Pregled resursa', RESOURCE_MANAGE: 'Upravljanje resursima i dodelama',
  STATION_READ: 'Pregled gaming stanica', STATION_MAINTENANCE: 'Održavanje gaming stanica', APPLICATION_PROFILE_MANAGE: 'Upravljanje aplikacionim profilima', MACHINE_IDENTITY_MANAGE: 'Upravljanje identitetima gaming klijenata',
  GAMING_SESSION_READ: 'Pregled gaming sesija', GAMING_SESSION_START: 'Pokretanje gaming sesija', GAMING_SESSION_EXTEND: 'Produžavanje gaming sesija', GAMING_SESSION_TERMINATE: 'Završavanje gaming sesija',
  RESERVATION_CREATE: 'Kreiranje rezervacija', RESERVATION_READ_OWN: 'Pregled sopstvenih rezervacija', RESERVATION_READ_ALL: 'Pregled svih rezervacija', RESERVATION_CHANGE_STATUS: 'Promena statusa rezervacija',
  WAITLIST_MANAGE: 'Upravljanje listom čekanja',
  ORDER_CREATE: 'Kreiranje narudžbina', ORDER_READ_OWN: 'Pregled sopstvenih narudžbina', ORDER_READ_ALL: 'Pregled svih narudžbina', ORDER_CHANGE_STATUS: 'Promena statusa narudžbina',
  DASHBOARD_SUMMARY: 'Zbirni pregled poslovanja', DASHBOARD_OPERATIONAL: 'Operativni pregled', METRICS_READ: 'Pregled metrika', REPORT_READ: 'Pregled izveštaja', REPORT_MANAGE: 'Upravljanje izveštajima',
  FEATURE_FLAG_MANAGE: 'Upravljanje funkcionalnostima aplikacije',
}
function permissionGroup(permission: Permission) {
  if (permission.startsWith('PROFILE_')) return 'Lični nalog'
  if (permission.startsWith('USER_') || permission === 'EMPLOYEE_LIST') return 'Korisnici i uloge'
  if (permission.startsWith('CUSTOMER_')) return 'Klijenti'
  if (permission.startsWith('CATALOG_')) return 'Katalog'
  if (permission.startsWith('RESERVATION_') || permission === 'WAITLIST_MANAGE') return 'Rezervacije'
  if (permission.startsWith('ORDER_')) return 'Narudžbine'
  if (permission.startsWith('GAMING_') || permission.startsWith('STATION_') || ['APPLICATION_PROFILE_MANAGE', 'MACHINE_IDENTITY_MANAGE'].includes(permission)) return 'Gaming operativa'
  if (permission.startsWith('WORKING_') || permission.startsWith('RESOURCE_')) return 'Dostupnost i resursi'
  if (permission.startsWith('REPORT_') || permission.startsWith('DASHBOARD_') || permission === 'METRICS_READ') return 'Pregledi i izveštaji'
  return 'Administracija i evidencija'
}
export function UserDetails({ user, actor, busy, onClose, onAction, onRefresh }: {
  user: UserResponse; actor: AuthUser; busy: boolean; onClose: () => void; onAction: ActionHandler; onRefresh: () => void
}) {
  const actions = allowedUserActions(actor, user)
  const groups = new Map<string, Permission[]>()
  for (const permission of [...new Set(user.permissions ?? [])]) {
    const group = permissionGroup(permission); groups.set(group, [...(groups.get(group) ?? []), permission])
  }
  return <div className="gm-user-details"><header className="gm-user-details-heading"><span>Detalji korisnika</span><Button iconOnly className="gm-user-inline-close" type="button" variant="secondary" disabled={busy} aria-label="Zatvori detalje korisnika" onClick={onClose}>×</Button></header>
    <div className="gm-user-identity"><UserAvatar user={user} large /><h2>{user.name}</h2><a href={`mailto:${user.email}`}>{user.email}</a><div><UserRoleBadge role={user.role} /><UserStatus user={user} /></div></div>
    <section><h3>Osnovne informacije</h3><dl className="gm-user-information">
      <div><dt>ID korisnika</dt><dd><code>{user.id}</code></dd></div><div><dt>Ime i prezime</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div>
      <div><dt>Uloga</dt><dd>{roleLabels[user.role]}</dd></div><div><dt>Status</dt><dd>{user.deletedAt ? 'Obrisan' : user.active ? 'Aktivan' : 'Neaktivan'}</dd></div>
      <div><dt>Datum registracije</dt><dd><time dateTime={user.createdAt}>{userDate(user.createdAt)}</time></dd></div><div><dt>Poslednja izmena</dt><dd><time dateTime={user.updatedAt}>{userDate(user.updatedAt)}</time></dd></div>
      {user.deletedAt && <><div><dt>Datum brisanja</dt><dd><time dateTime={user.deletedAt}>{userDate(user.deletedAt)}</time></dd></div><div><dt>Razlog brisanja</dt><dd>{user.deletionReason || 'Razlog nije dostupan.'}</dd></div></>}
    </dl></section>
    <section><h3><UserIcon kind="shield" />Dozvole korisnika</h3><p className="gm-user-note">Pregled dodeljenih dozvola. Ovaj prikaz služi za čitanje.</p>
      {!groups.size ? <p className="gm-user-note">Dozvole nisu navedene u odgovoru servera.</p> : [...groups.entries()].map(([group, permissions]) => <div className="gm-user-permission-group" key={group}><h4>{group}</h4>
        <ul>{permissions.sort((a, b) => (permissionLabels[a] ?? a).localeCompare(permissionLabels[b] ?? b, 'sr-Latn-RS')).map(permission => <li key={permission}><span title={permission}>{permissionLabels[permission] ?? permission}</span></li>)}</ul></div>)}
    </section>
    <div className="gm-user-details-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onRefresh}><UserIcon kind="refresh" />Osveži detalje</Button>
      {actions.deactivate && <Button type="button" variant="danger" disabled={busy} onClick={event => onAction(user, 'deactivate', event.currentTarget)}><UserIcon kind="lock" />Deaktiviraj nalog</Button>}
      {actions.remove && <Button type="button" variant="danger" disabled={busy} onClick={event => onAction(user, 'delete', event.currentTarget)}><UserIcon kind="delete" />Obriši nalog</Button>}
      {actions.restore && <Button type="button" variant="success" disabled={busy} onClick={event => onAction(user, 'restore', event.currentTarget)}><UserIcon kind="restore" />Vrati nalog</Button>}
    </div>
  </div>
}
