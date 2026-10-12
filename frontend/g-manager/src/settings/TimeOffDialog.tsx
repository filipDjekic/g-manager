import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { timeOffApi } from '../api/timeOffApi'
import { Button, ErrorState, FormField, Input, Modal, Select, Textarea } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { businessLocalToInstant } from '../reservations/dateTime'
import type { TimeOff } from '../types/timeOff.types'
import type { UserResponse } from '../types/user.types'
import { elapsedTime, SettingsIcon, settingsError } from './settingsPresentation'

export function TimeOffDialog({ employees, returnFocusRef, onClose, onSaved }: {
  employees: UseQueryResult<UserResponse[]>; returnFocusRef: RefObject<HTMLElement | null>; onClose: () => void; onSaved: (item: TimeOff) => void
}) {
  const id = useId(), first = useRef<HTMLSelectElement>(null), inFlight = useRef(false)
  const [form, setForm] = useState({ employeeId: '', startsAt: '', endsAt: '', reason: '' }), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const { confirm, confirmationDialog } = useConfirmDialog()
  const dirty = Boolean(form.employeeId || form.startsAt || form.endsAt || form.reason)
  useDirtyGuard(dirty)
  const close = () => {
    if (inFlight.current) return
    if (!dirty) onClose()
    else confirm({ title: 'Odbaci nesačuvani zahtev?', description: 'Uneti podaci odsustva neće biti sačuvani.', confirmLabel: 'Odbaci izmene',
      className: 'gm-settings-dialog', onConfirm: onClose })
  }
  let start = '', end = ''
  try { if (form.startsAt) start = businessLocalToInstant(form.startsAt); if (form.endsAt) end = businessLocalToInstant(form.endsAt) } catch { /* Explicit messages are shown on submission. */ }
  const change = (values: Partial<typeof form>) => { if (!busy) { setForm(current => ({ ...current, ...values })); setError('') } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    try {
      const startsAt = businessLocalToInstant(form.startsAt), endsAt = businessLocalToInstant(form.endsAt)
      if (Date.parse(endsAt) <= Date.parse(startsAt)) { setError('Kraj odsustva mora biti posle početka.'); return }
      if (!employees.data?.some(item => item.id === form.employeeId && item.active && item.role === 'EMPLOYEE' && !item.deletedAt)
        || employees.isError) { setError('Izaberite aktivnog zaposlenog.'); first.current?.focus(); return }
      if (!form.reason.trim() || form.reason.length > 500) { setError('Unesite razlog odsustva, do 500 karaktera.'); return }
      inFlight.current = true; setBusy(true); setError('')
      const value = await timeOffApi.create({ employeeId: form.employeeId, startsAt, endsAt, reason: form.reason.trim() })
      onSaved(value)
    } catch (cause) { setError(settingsError(cause, 'Zahtev za odsustvo nije moguće sačuvati.')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <>
    <Modal open title="Novo odsustvo" titleIcon={<SettingsIcon kind="calendar" />} className="gm-settings-dialog" onClose={close} closeDisabled={busy}
      descriptionId={id + '-description'} initialFocusRef={first} returnFocusRef={returnFocusRef}
      footer={<div className="gm-settings-dialog-actions"><Button type="button" variant="secondary" disabled={busy} onClick={close}>Otkaži</Button>
        <Button type="submit" form={id} className="gm-settings-primary" loading={busy} disabled={employees.isLoading || employees.isError}>Sačuvaj zahtev</Button></div>}>
      <p id={id + '-description'} className="gm-settings-note">Kreirajte zahtev za odsustvo zaposlenog.</p>
      <form id={id} className="gm-settings-form" onSubmit={submit}>
        <div className="gm-settings-form-wide"><FormField label="Zaposleni *" htmlFor={id + '-employee'}><Select ref={first} id={id + '-employee'} required
          value={form.employeeId} disabled={busy || employees.isLoading || employees.isError} onChange={event => change({ employeeId: event.target.value })}>
          <option value="">Izaberite zaposlenog</option>{employees.data?.filter(item => item.active && item.role === 'EMPLOYEE' && !item.deletedAt).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField></div>
        <FormField label="Početak *" htmlFor={id + '-start'} hint="Europe/Belgrade"><Input id={id + '-start'} type="datetime-local" step="60" required
          value={form.startsAt} disabled={busy} onChange={event => change({ startsAt: event.target.value })} /></FormField>
        <FormField label="Kraj *" htmlFor={id + '-end'} hint="Europe/Belgrade"><Input id={id + '-end'} type="datetime-local" step="60" required
          value={form.endsAt} disabled={busy} onChange={event => change({ endsAt: event.target.value })} /></FormField>
        {start && end && Date.parse(end) > Date.parse(start) && <div className="gm-settings-form-wide gm-settings-duration"><SettingsIcon kind="clock" />Ukupno trajanje perioda: <strong>{elapsedTime(start, end)}</strong></div>}
        <div className="gm-settings-form-wide"><FormField label="Razlog *" htmlFor={id + '-reason'} hint={`${form.reason.length}/500`}>
          <Textarea id={id + '-reason'} required rows={4} maxLength={500} value={form.reason} disabled={busy} onChange={event => change({ reason: event.target.value })} /></FormField></div>
        {employees.error && <div className="gm-settings-form-wide"><ErrorState message="Zaposlene nije moguće učitati." action={<Button type="button" onClick={() => void employees.refetch()}>Pokušaj ponovo</Button>} /></div>}
        {!employees.isLoading && !employees.error && !employees.data?.some(item => item.active) && <p className="gm-settings-note gm-settings-form-wide">Nema aktivnih zaposlenih za izbor.</p>}
        {error && <p className="error-banner gm-settings-form-wide" role="alert">{error}</p>}
      </form>
    </Modal>
    {confirmationDialog}
  </>
}
