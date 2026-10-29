import { useRef, useState } from 'react'
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { timeOffApi } from '../api/timeOffApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, EmptyState, ErrorState, Input, Modal, Select, Skeleton, TableShell, Card, Alert } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import { useServerNow } from '../gaming/useServerNow'
import type { TimeOff, TimeOffStatus } from '../types/timeOff.types'
import type { UserResponse } from '../types/user.types'
import { TimeOffDialog } from './TimeOffDialog'
import { SettingsActionMenu, SettingsAvatar, SettingsIcon } from './settingsPresentation'
import { businessDayBounds, elapsedTime, restoreSettingsFocus, settingsDateTime, settingsError, timeOffLabels, timeOffTones, validCalendarDate } from './settingsPresentation.model'

export function EmployeeTimeOffSettings({ query, employees, onChanged }: {
  query: UseQueryResult<TimeOff[]>; employees: UseQueryResult<UserResponse[]>; onChanged: () => Promise<void>
}) {
  const actor = useAuthStore(state => state.user), canManage = hasCapability(actor, 'WORKING_HOURS_MANAGE'), canEmail = hasCapability(actor, 'USER_LIST')
  const toast = useToast(), client = useQueryClient(), { confirm, confirmationDialog } = useConfirmDialog(), now = useServerNow()
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '', employeeId: '' })
  const [createOpen, setCreateOpen] = useState(false), [detailId, setDetailId] = useState(''), [saving, setSaving] = useState('')
  const inFlight = useRef(false), opener = useRef<HTMLElement | null>(null), newButton = useRef<HTMLButtonElement>(null), detailClose = useRef<HTMLButtonElement>(null)
  const names = new Map(employees.data?.map(item => [item.id, item]) ?? [])
  const name = (item: TimeOff) => names.get(item.employeeId)?.name ?? (employees.isLoading ? 'Učitavanje zaposlenog…' : 'Zaposleni nije dostupan')
  let bounds = { from: '', to: '' }, filterError = ''
  try {
    if (filters.from && !validCalendarDate(filters.from) || filters.to && !validCalendarDate(filters.to) || filters.from && filters.to && filters.from > filters.to) filterError = 'Izaberite ispravan period. Završni datum ne sme biti pre početnog.'
    else bounds = businessDayBounds(filters.from, filters.to)
  } catch (cause) { filterError = settingsError(cause, 'Period nije validan.') }
  const search = filters.search.trim().toLocaleLowerCase('sr-Latn-RS')
  const rows = (query.data ?? []).filter(item => (!filters.status || item.status === filters.status) && (!filters.employeeId || item.employeeId === filters.employeeId)
    && (!search || [name(item), canEmail ? names.get(item.employeeId)?.email : ''].filter(Boolean).some(value => value!.toLocaleLowerCase('sr-Latn-RS').includes(search)))
    && (!bounds.from || Date.parse(item.endsAt) > Date.parse(bounds.from)) && (!bounds.to || Date.parse(item.startsAt) < Date.parse(bounds.to)))
  const detail = query.data?.find(item => item.id === detailId)
  const create = () => { opener.current = newButton.current; setCreateOpen(true) }
  const closeCreate = () => { setCreateOpen(false); restoreSettingsFocus(opener.current) }
  const closeDetail = () => { setDetailId(''); restoreSettingsFocus(opener.current) }
  const showDetails = (item: TimeOff, trigger: HTMLElement | null) => { opener.current = trigger; setDetailId(item.id) }
  const decide = (item: TimeOff, status: TimeOffStatus) => {
    if (!canManage || inFlight.current || (item.status !== 'PENDING' && !(item.status === 'APPROVED' && status === 'CANCELLED'))) return
    if (status === 'APPROVED' && Date.parse(item.endsAt) <= now) return
    const label = status === 'APPROVED' ? 'Odobri odsustvo' : status === 'REJECTED' ? 'Odbij zahtev' : 'Otkaži odsustvo'
    confirm({ title: label, titleIcon: <SettingsIcon kind="calendar" />, className: 'gm-settings-dialog', confirmLabel: label,
      variant: status === 'CANCELLED' ? 'danger' : status === 'REJECTED' ? 'warning' : 'default',
      description: <><p><strong>{name(item)}</strong></p><p>{settingsDateTime(item.startsAt)} – {settingsDateTime(item.endsAt)}</p>
        <p>{status === 'APPROVED' ? 'Odobreno odsustvo blokira dostupnost zaposlenog za rezervacije tokom ovog perioda.' : status === 'REJECTED' ? 'Zahtev će biti odbijen.' : 'Odsustvo će biti otkazano. Odobreno odsustvo više neće blokirati dostupnost zaposlenog.'}</p></>,
      reasonLabel: 'Razlog odluke', reasonMaxLength: 500, reasonRequired: false,
      formatError: cause => settingsError(cause, 'Status odsustva nije moguće promeniti.'), onConfirm: async reason => {
        if (inFlight.current) return
        inFlight.current = true; setSaving(item.id)
        try {
          const value = await timeOffApi.decide(item, status, reason)
          client.setQueryData<TimeOff[]>(['settings', 'time-off', actor?.id], current => (current ?? []).map(row => row.id === value.id ? value : row))
          toast(status === 'APPROVED' ? 'Odsustvo je odobreno.' : status === 'REJECTED' ? 'Zahtev je odbijen.' : 'Odsustvo je otkazano.', 'success')
          await onChanged()
          window.requestAnimationFrame(() => detailClose.current?.focus())
        } catch (cause) { await query.refetch(); throw cause } finally { inFlight.current = false; setSaving('') }
      } })
  }
  const actions = (item: TimeOff) => [
    { label: 'Detalji', icon: 'info' as const, onClick: (trigger: HTMLButtonElement | null) => showDetails(item, trigger) },
    ...(canManage && item.status === 'PENDING' && Date.parse(item.endsAt) > now ? [{ label: 'Odobri', icon: 'check' as const, onClick: () => decide(item, 'APPROVED') }] : []),
    ...(canManage && item.status === 'PENDING' ? [{ label: 'Odbij', icon: 'close' as const, onClick: () => decide(item, 'REJECTED') }] : []),
    ...(canManage && (item.status === 'PENDING' || item.status === 'APPROVED') ? [{ label: 'Otkaži', icon: 'close' as const, danger: true, onClick: () => decide(item, 'CANCELLED') }] : []),
  ]
  const hasFilters = Object.values(filters).some(Boolean), disabled = Boolean(saving) || query.isFetching || query.isError
  const person = (item: TimeOff) => <div className="gm-settings-person"><SettingsAvatar name={names.get(item.employeeId)?.name ?? ''} /><div><strong>{name(item)}</strong>
    {canEmail && names.get(item.employeeId)?.email && <small>{names.get(item.employeeId)?.email}</small>}</div></div>
  const period = (item: TimeOff) => <div className="gm-settings-period"><span>{settingsDateTime(item.startsAt)}</span><span>do {settingsDateTime(item.endsAt)}</span><small>Ukupno {elapsedTime(item.startsAt, item.endsAt)}</small></div>
  return <Card className="gm-settings-section">
    <header className="gm-settings-section-header"><div><h2>Odsustva zaposlenih</h2><p>Pregled i upravljanje odsustvima i zahtevima zaposlenih.</p></div><div className="gm-settings-actions">
      <Button type="button" variant="secondary" loading={query.isFetching} disabled={Boolean(saving)} onClick={() => void query.refetch()}><SettingsIcon kind="refresh" />Osveži</Button>
      {canManage && <Button type="button" ref={newButton} className="gm-settings-primary" disabled={Boolean(saving)} onClick={create}><SettingsIcon kind="plus" />Novo odsustvo</Button>}</div></header>
    <div className="gm-settings-timeoff-filters">
      <label className="gm-settings-search"><span>Pretraga zaposlenog</span><Input type="search" maxLength={120} value={filters.search} placeholder="Ime zaposlenog ili email"
        onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} /></label>
      <label>Status<Select aria-label={"Status"} value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}><option value="">Svi statusi</option>
        {Object.entries(timeOffLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
      <label>Zaposleni<Select aria-label={"Zaposleni"} value={filters.employeeId} disabled={employees.isLoading || employees.isError} onChange={event => setFilters(current => ({ ...current, employeeId: event.target.value }))}>
        <option value="">Svi zaposleni</option>{employees.data?.map(item => <option key={item.id} value={item.id}>{item.name}{!item.active ? ' · neaktivan' : ''}</option>)}</Select></label>
      <label>Period od<Input aria-label={"Period od"} type="date" value={filters.from} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))} /></label>
      <label>Period do<Input aria-label={"Period do"} type="date" value={filters.to} onChange={event => setFilters(current => ({ ...current, to: event.target.value }))} /></label>
      <Button type="button" variant="secondary" onClick={() => setFilters({ search: '', status: '', from: '', to: '', employeeId: '' })}>Poništi filtere</Button>
    </div>
    {employees.error && <ErrorState message="Imena zaposlenih nisu dostupna. Odsustva možete pregledati po periodu i statusu." action={<Button onClick={() => void employees.refetch()}>Ponovi učitavanje zaposlenih</Button>} />}
    {filterError && <Alert tone="danger" role="alert">{filterError}</Alert>}
    {query.isLoading ? <Skeleton lines={6} label="Učitavanje odsustava" /> : query.error ? <ErrorState message={settingsError(query.error, 'Odsustva nije moguće učitati.')}
      action={<Button variant="secondary" onClick={() => void query.refetch()}>Pokušaj ponovo</Button>} /> : !filterError && !rows.length ? <EmptyState title={hasFilters ? 'Nema odsustava koja odgovaraju filterima.' : 'Nema zahteva za odsustvo.'}
        description={hasFilters ? 'Promenite pretragu ili izabrani period.' : 'Dodajte novi zahtev za odsustvo zaposlenog.'}
        action={hasFilters ? <Button variant="secondary" onClick={() => setFilters({ search: '', status: '', from: '', to: '', employeeId: '' })}>Poništi filtere</Button> : canManage ? <Button onClick={create}>Novo odsustvo</Button> : undefined} />
      : !filterError && <div className="gm-settings-timeoff-list">
        <TableShell label="Odsustva zaposlenih" className="gm-settings-timeoff-table"><table className="ui-data-table"><thead><tr><th scope="col">Zaposleni</th><th scope="col">Period odsustva</th><th scope="col">Razlog</th><th scope="col">Status</th><th scope="col">Akcije</th></tr></thead>
          <tbody>{rows.map(item => <tr key={item.id}><td>{person(item)}</td><td>{period(item)}</td><td><p className="gm-settings-reason">{item.reason}</p></td>
            <td><Badge tone={timeOffTones[item.status]}>{timeOffLabels[item.status]}</Badge></td><td><SettingsActionMenu label={`Akcije odsustva za ${name(item)}`} actions={actions(item)} disabled={disabled} /></td></tr>)}</tbody></table></TableShell>
        <div className="gm-settings-timeoff-cards">{rows.map(item => <Card as="article" className="gm-settings-timeoff-card" key={item.id}><header>{person(item)}
          <SettingsActionMenu label={`Akcije odsustva za ${name(item)}`} actions={actions(item)} disabled={disabled} /></header>{period(item)}<p className="gm-settings-reason">{item.reason}</p>
          <footer><Badge tone={timeOffTones[item.status]}>{timeOffLabels[item.status]}</Badge><Button type="button" variant="secondary" onClick={event => showDetails(item, event.currentTarget)}>Detalji</Button></footer></Card>)}</div>
      </div>}
    {query.data && !query.isError && !filterError && <p className="gm-settings-note">Prikazano {rows.length} od {query.data.length} odsustava. Trajanje predstavlja proteklo vreme perioda.</p>}
    {createOpen && <TimeOffDialog employees={employees} returnFocusRef={opener} onClose={closeCreate} onSaved={item => {
      client.setQueryData<TimeOff[]>(['settings', 'time-off', actor?.id], current => [...(current ?? []), item])
      closeCreate(); toast('Zahtev za odsustvo je sačuvan.', 'success'); void onChanged()
    }} />}
    {detail && <Modal size="wide" open title="Detalji odsustva" titleIcon={<SettingsIcon kind="calendar" />} className="gm-settings-dialog" returnFocusRef={opener} onClose={closeDetail}
      footer={<div className="ui-actions gm-settings-dialog-actions"><Button ref={detailClose} type="button" variant="secondary" onClick={closeDetail}>Zatvori</Button>
        {canManage && detail.status === 'PENDING' && Date.parse(detail.endsAt) > now && <Button variant="success" type="button" className="gm-settings-primary" disabled={disabled} onClick={() => decide(detail, 'APPROVED')}>Odobri</Button>}
        {canManage && detail.status === 'PENDING' && <Button type="button" variant="secondary" disabled={disabled} onClick={() => decide(detail, 'REJECTED')}>Odbij</Button>}
        {canManage && (detail.status === 'PENDING' || detail.status === 'APPROVED') && <Button type="button" variant="danger" disabled={disabled} onClick={() => decide(detail, 'CANCELLED')}>Otkaži odsustvo</Button>}</div>}>
      {person(detail)}<dl className="gm-settings-detail-list"><div><dt>Početak</dt><dd>{settingsDateTime(detail.startsAt)}</dd></div><div><dt>Kraj</dt><dd>{settingsDateTime(detail.endsAt)}</dd></div>
        <div><dt>Trajanje perioda</dt><dd>{elapsedTime(detail.startsAt, detail.endsAt)}</dd></div><div><dt>Status</dt><dd><Badge tone={timeOffTones[detail.status]}>{timeOffLabels[detail.status]}</Badge></dd></div></dl>
      <div className="gm-settings-detail-reason"><h3>Razlog odsustva</h3><p>{detail.reason}</p></div>
      {detail.decisionReason && <div className="gm-settings-detail-reason"><h3>Razlog odluke</h3><p>{detail.decisionReason}</p></div>}
    </Modal>}
    {confirmationDialog}
  </Card>
}
