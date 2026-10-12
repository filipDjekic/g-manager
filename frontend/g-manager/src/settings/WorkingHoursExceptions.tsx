import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { workingHoursApi } from '../api/workingHoursApi'
import { resourceApi } from '../api/resourceApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, EmptyState, ErrorState, Modal, Skeleton } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import type { WorkingHours, WorkingHoursException } from '../types/workingHours.types'
import { WorkingHoursExceptionDialog } from './WorkingHoursExceptionDialog'
import { addCalendarDays, days, exceptionPresentation, restoreSettingsFocus, SettingsActionMenu, SettingsIcon, settingsDate, settingsError, useBusinessToday } from './settingsPresentation'

const weekdays = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned']
function shiftedMonth(month: string, amount: number) {
  const value = new Date(month + '-01T12:00:00Z'); value.setUTCMonth(value.getUTCMonth() + amount)
  return value.toISOString().slice(0, 7)
}
export function WorkingHoursExceptions({ query, hours, active, onChanged }: {
  query: UseQueryResult<WorkingHoursException[]>; hours: UseQueryResult<WorkingHours[]>; active: boolean; onChanged: () => Promise<void>
}) {
  const actor = useAuthStore(state => state.user), canManage = hasCapability(actor, 'WORKING_HOURS_MANAGE'), today = useBusinessToday()
  const client = useQueryClient(), toast = useToast(), { confirm, confirmationDialog } = useConfirmDialog()
  const [month, setMonth] = useState(() => today.slice(0, 7)), [selected, setSelected] = useState(today), [focused, setFocused] = useState(today)
  const [dialog, setDialog] = useState<{ item?: WorkingHoursException; date?: string } | null>(null)
  const [detail, setDetail] = useState<WorkingHoursException | null>(null), [deleting, setDeleting] = useState(false)
  const opener = useRef<HTMLElement | null>(null), newButton = useRef<HTMLButtonElement>(null), calendar = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const first = month + '-01', offset = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7
  const start = addCalendarDays(first, -offset), end = addCalendarDays(start, 41)
  const calendarQuery = useQuery({ queryKey: ['working-hours', 'exceptions', 'month', start, end],
    queryFn: () => workingHoursApi.listExceptions({ from: start, to: end }), enabled: active && hasCapability(actor, 'WORKING_HOURS_READ') })
  const locations = useQuery({ queryKey: ['setup', 'locations'], queryFn: resourceApi.locations, enabled: hasCapability(actor, 'RESOURCE_READ'), staleTime: 300000 })
  useEffect(() => {
    if (!active) { pendingFocus.current = null; return }
    if (!pendingFocus.current || calendarQuery.isLoading || calendarQuery.isError) return
    const target = calendar.current?.querySelector<HTMLButtonElement>(`[data-date="${pendingFocus.current}"]`)
    if (target) { target.focus(); pendingFocus.current = null }
  }, [active, month, focused, calendarQuery.isLoading, calendarQuery.isError])
  const locationName = (item: WorkingHoursException) => item.locationId ? locations.data?.find(row => row.id === item.locationId)?.name || 'Lokacijski raspored' : 'Standardni raspored'
  const grouped = new Map<string, WorkingHoursException[]>()
  calendarQuery.data?.forEach(item => grouped.set(item.date, [...(grouped.get(item.date) ?? []), item]))
  const detailValue = detail ? query.data?.find(item => item.id === detail.id) ?? calendarQuery.data?.find(item => item.id === detail.id) ?? detail : undefined
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['working-hours', 'exceptions'] }) }
  const edit = (item: WorkingHoursException, trigger: HTMLElement | null) => { opener.current = trigger; setDetail(null); setDialog({ item }) }
  const view = (item: WorkingHoursException, trigger: HTMLElement | null) => { opener.current = trigger; setDetail(item) }
  const create = (date?: string, trigger?: HTMLElement | null) => { opener.current = trigger ?? newButton.current; setDialog({ date }) }
  const closeDialog = () => { setDialog(null); restoreSettingsFocus(opener.current) }
  const closeDetail = () => { setDetail(null); restoreSettingsFocus(opener.current) }
  const remove = (item: WorkingHoursException, trigger: HTMLButtonElement | null) => {
    opener.current = trigger
    confirm({ title: 'Obriši izuzetak', titleIcon: <SettingsIcon kind="trash" />, className: 'gm-settings-dialog',
      description: <><p>{settingsDate(item.date)} · {locationName(item)}</p><p>Brisanjem izuzetka ponovo će važiti standardni nedeljni raspored.</p></>,
      variant: 'danger', confirmLabel: 'Obriši izuzetak', formatError: cause => settingsError(cause, 'Izuzetak nije moguće obrisati.'),
      onConfirm: async () => {
        setDeleting(true)
        try {
          await workingHoursApi.deleteException(item)
          if (detail?.id === item.id) setDetail(null)
          toast('Izuzetak je obrisan.', 'success')
          await onChanged()
          restoreSettingsFocus(opener.current)
        } catch (cause) { await refresh(); throw cause }
        finally { setDeleting(false) }
      } })
  }
  const actions = (item: WorkingHoursException) => [
    { label: 'Detalji', icon: 'info' as const, onClick: (trigger: HTMLButtonElement | null) => view(item, trigger) },
    ...(canManage ? [{ label: 'Izmeni', icon: 'edit' as const, onClick: (trigger: HTMLButtonElement | null) => edit(item, trigger) },
      { label: 'Obriši', icon: 'trash' as const, danger: true, onClick: (trigger: HTMLButtonElement | null) => remove(item, trigger) }] : []),
  ]
  const pick = (date: string, trigger: HTMLButtonElement) => {
    setSelected(date); setFocused(date)
    const items = grouped.get(date)
    if (items?.length) view(items[0], trigger)
    else if (date > today && canManage && !calendarQuery.isError) create(date, trigger)
  }
  const changeMonth = (amount: number) => { const next = shiftedMonth(month, amount); setMonth(next); setSelected(''); setFocused(next + '-01') }
  const future = query.data?.filter(item => item.date >= today) ?? []
  const chosen = grouped.get(selected) ?? []
  return <section className="gm-settings-section">
    <header className="gm-settings-section-header"><div><h2>Izuzeci radnog vremena</h2><p>Posebni datumi kada igraonica ne radi ili ima izmenjeno radno vreme.</p></div>
      <div className="gm-settings-actions"><Button variant="secondary" type="button" loading={query.isFetching || calendarQuery.isFetching} disabled={deleting} onClick={() => void refresh()}><SettingsIcon kind="refresh" />Osveži</Button>
        {canManage && <Button ref={newButton} type="button" className="gm-settings-primary" disabled={deleting} onClick={() => create()}><SettingsIcon kind="plus" />Novi izuzetak</Button>}</div></header>
    <div className="gm-settings-exceptions-grid">
      <section className="gm-settings-calendar-card">
        <header className="gm-settings-calendar-heading"><h3 aria-live="polite">{new Intl.DateTimeFormat('sr-Latn-RS', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(first + 'T12:00:00Z'))}</h3>
          <div><Button type="button" variant="secondary" aria-label="Prethodni mesec" onClick={() => changeMonth(-1)}><SettingsIcon kind="chevron-left" /></Button>
            <Button type="button" variant="secondary" aria-label="Sledeći mesec" onClick={() => changeMonth(1)}><SettingsIcon kind="chevron-right" /></Button></div></header>
        <div className="gm-settings-calendar-weekdays" aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
        {calendarQuery.error && <ErrorState message={settingsError(calendarQuery.error, 'Izuzetke za ovaj mesec nije moguće učitati.')} action={<Button onClick={() => void calendarQuery.refetch()}>Pokušaj ponovo</Button>} />}
        {calendarQuery.isLoading ? <Skeleton lines={6} label="Učitavanje kalendara izuzetaka" /> : <div ref={calendar} className="gm-settings-calendar-days" aria-label="Datumi meseca">
          {Array.from({ length: 42 }, (_, index) => {
            const date = addCalendarDays(start, index), entries = grouped.get(date) ?? []
            const presentation = entries.length === 1 ? exceptionPresentation(entries[0], hours.isError ? undefined : hours.data) : undefined
            const day = days[(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7]
            const regular = hours.data?.find(item => item.dayOfWeek === day)
            const closed = !entries.length && date >= today && regular && !regular.active && !hours.isError
            const caption = calendarQuery.isError ? 'Podaci nisu učitani' : entries.length > 1 ? `${entries.length} izuzetaka`
              : presentation?.label ?? (closed ? 'Dan nije aktivan u nedeljnom rasporedu' : 'Bez evidentiranog izuzetka')
            return <button key={date} type="button" data-date={date} disabled={calendarQuery.isError}
              className={`gm-settings-calendar-day${date.slice(0, 7) !== month ? ' is-outside' : ''}${date === today ? ' is-today' : ''}${date === selected ? ' is-selected' : ''}${closed ? ' is-regular-closed' : ''}${presentation ? ' is-' + presentation.kind : entries.length > 1 ? ' is-custom' : ''}`}
              tabIndex={focused === date ? 0 : -1} aria-current={date === today ? 'date' : undefined} aria-pressed={date === selected}
              aria-label={`${settingsDate(date)} · ${caption}`} title={caption} onFocus={() => setFocused(date)} onClick={event => pick(date, event.currentTarget)}
              onKeyDown={event => {
                let next = date
                if (event.key === 'ArrowLeft') next = addCalendarDays(date, -1)
                else if (event.key === 'ArrowRight') next = addCalendarDays(date, 1)
                else if (event.key === 'ArrowUp') next = addCalendarDays(date, -7)
                else if (event.key === 'ArrowDown') next = addCalendarDays(date, 7)
                else if (event.key === 'Home') next = addCalendarDays(date, -index % 7)
                else if (event.key === 'End') next = addCalendarDays(date, 6 - index % 7)
                else return
                event.preventDefault(); pendingFocus.current = next; setFocused(next)
                if (next < start || next > end) setMonth(next.slice(0, 7))
              }}><span>{Number(date.slice(8))}</span>{entries.length > 0 && <span className="gm-settings-calendar-dot" aria-hidden="true" />}</button>
          })}
        </div>}
        <div className="gm-settings-calendar-legend"><span className="is-closed">Zatvoreno</span><span className="is-shorter">Skraćeno</span><span className="is-extended">Produženo</span><span className="is-custom">Posebno</span></div>
        {selected && <div className="gm-settings-selected-date"><strong>{settingsDate(selected)}</strong>{chosen.length ? chosen.map(item => <button type="button" key={item.id} onClick={event => view(item, event.currentTarget)}>
          {locationName(item)} · {exceptionPresentation(item, hours.data).label}</button>) : <p>{calendarQuery.error ? 'Izuzetke nije moguće potvrditi.' : 'Nema evidentiranih izuzetaka za izabrani datum.'}</p>}</div>}
        <p className="gm-settings-note">Boje posebnog radnog vremena upoređuju globalni izuzetak sa sačuvanim nedeljnim rasporedom. Lokacijski izuzeci označeni su kao posebno radno vreme.</p>
      </section>
      <section className="gm-settings-upcoming"><header><h3>Budući izuzeci</h3><Badge tone="neutral">{query.isError ? '—' : future.length}</Badge></header>
        {query.isLoading ? <Skeleton lines={5} label="Učitavanje budućih izuzetaka" /> : query.error ? <ErrorState message={settingsError(query.error, 'Listu izuzetaka nije moguće učitati.')}
          action={<Button onClick={() => void query.refetch()}>Pokušaj ponovo</Button>} /> : !future.length ? <EmptyState title="Nema definisanih izuzetaka." description="Standardni nedeljni raspored važi dok ne dodate izuzetak."
            action={canManage ? <Button type="button" variant="secondary" onClick={() => create()}>Novi izuzetak</Button> : undefined} /> : <div className="gm-settings-exception-list">{future.map(item => {
              const presentation = exceptionPresentation(item, hours.isError ? undefined : hours.data)
              return <article key={item.id} className={`gm-settings-exception gm-settings-exception--${presentation.kind}`}><header><div><button type="button" className="gm-settings-text-button" onClick={event => view(item, event.currentTarget)}>{settingsDate(item.date)}</button><small>{locationName(item)}</small></div>
                <SettingsActionMenu label={`Akcije izuzetka za ${settingsDate(item.date)}`} actions={actions(item)} disabled={deleting || query.isFetching} /></header>
                <p>{item.description || 'Bez opisa'}</p><div className="gm-settings-exception-meta"><Badge tone={presentation.tone}>{presentation.label}</Badge>
                  {!item.fullDayClosed && <span>{item.overrideOpenTime?.slice(0, 5)} – {item.overrideCloseTime?.slice(0, 5)}{(item.overrideCloseTime ?? '') < (item.overrideOpenTime ?? '') ? ' · prelazi ponoć' : ''}</span>}</div></article>
            })}</div>}
      </section>
    </div>
    {dialog && <WorkingHoursExceptionDialog item={dialog.item} date={dialog.date} locationName={dialog.item ? locationName(dialog.item) : undefined} returnFocusRef={opener} onClose={closeDialog}
      onConflict={refresh} onSaved={value => { setDialog(null); setSelected(value.date); setMonth(value.date.slice(0, 7)); setFocused(value.date); restoreSettingsFocus(opener.current); toast('Izuzetak je sačuvan.', 'success'); void onChanged() }} />}
    {detailValue && <Modal open title="Detalji izuzetka" titleIcon={<SettingsIcon kind="calendar" />} className="gm-settings-dialog" returnFocusRef={opener} onClose={closeDetail}
      footer={<div className="gm-settings-dialog-actions"><Button type="button" variant="secondary" onClick={closeDetail}>Zatvori</Button>
        {canManage && <Button type="button" className="gm-settings-primary" onClick={() => edit(detailValue, opener.current)}>Izmeni izuzetak</Button>}</div>}>
      <dl className="gm-settings-detail-list"><div><dt>Datum</dt><dd>{settingsDate(detailValue.date)}</dd></div><div><dt>Raspored</dt><dd>{locationName(detailValue)}</dd></div>
        <div><dt>Status</dt><dd><Badge tone={exceptionPresentation(detailValue, hours.data).tone}>{exceptionPresentation(detailValue, hours.data).label}</Badge></dd></div>
        {!detailValue.fullDayClosed && <><div><dt>Otvaranje</dt><dd>{detailValue.overrideOpenTime?.slice(0, 5)}</dd></div><div><dt>Zatvaranje</dt><dd>{detailValue.overrideCloseTime?.slice(0, 5)}</dd></div></>}</dl>
      <div className="gm-settings-detail-reason"><h3>Opis</h3><p>{detailValue.description || 'Bez opisa'}</p></div>
    </Modal>}
    {confirmationDialog}
  </section>
}
