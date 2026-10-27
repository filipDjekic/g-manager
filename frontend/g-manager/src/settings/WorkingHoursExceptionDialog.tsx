import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { isAxiosError } from 'axios'
import { workingHoursApi } from '../api/workingHoursApi'
import { Button, FormField, Input, Modal, Textarea, Badge } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { workingHoursExceptionSchema } from '../workingHours/workingHoursSchema'
import { todayInBusinessZone } from '../reservations/dateTime'
import type { WorkingHoursException, WorkingHoursExceptionInput } from '../types/workingHours.types'
import { SettingsIcon, SettingsSwitch } from './settingsPresentation'
import { addCalendarDays, settingsError, useBusinessToday, validCalendarDate, validTime } from './settingsPresentation.model'

export function WorkingHoursExceptionDialog({ item, date, locationName, returnFocusRef, onClose, onSaved, onConflict }: {
  item?: WorkingHoursException; date?: string; locationName?: string; returnFocusRef: RefObject<HTMLElement | null>
  onClose: () => void; onSaved: (value: WorkingHoursException) => void; onConflict: () => Promise<void>
}) {
  const id = useId(), dateRef = useRef<HTMLInputElement>(null), inFlight = useRef(false), today = useBusinessToday()
  const initial = { date: item?.date ?? date ?? '', description: item?.description ?? '', fullDayClosed: item?.fullDayClosed ?? true,
    overrideOpenTime: item?.overrideOpenTime?.slice(0, 5) ?? '', overrideCloseTime: item?.overrideCloseTime?.slice(0, 5) ?? '' }
  const [form, setForm] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false)
  const { confirm, confirmationDialog } = useConfirmDialog()
  const dirty = JSON.stringify(initial) !== JSON.stringify(form)
  useDirtyGuard(dirty)
  const close = () => {
    if (inFlight.current) return
    if (!dirty) onClose()
    else confirm({ title: 'Odbaci nesačuvane izmene?', description: 'Uneti podaci izuzetka neće biti sačuvani.', confirmLabel: 'Odbaci izmene',
      className: 'gm-settings-dialog', onConfirm: onClose })
  }
  const change = (values: Partial<typeof form>) => { if (!busy) { setForm(current => ({ ...current, ...values })); setError('') } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || conflict) return
    const parsed = workingHoursExceptionSchema.safeParse(form)
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Izuzetak nije validan.'); return }
    if (!validCalendarDate(form.date) || form.date <= todayInBusinessZone()) { setError('Izaberite ispravan datum posle današnjeg datuma u zoni Europe/Belgrade.'); dateRef.current?.focus(); return }
    if (!form.fullDayClosed && (!validTime(form.overrideOpenTime) || !validTime(form.overrideCloseTime))) { setError('Unesite oba vremena u formatu HH:mm.'); return }
    const input: WorkingHoursExceptionInput = { ...parsed.data, description: parsed.data.description?.trim() || undefined,
      overrideOpenTime: form.fullDayClosed ? undefined : form.overrideOpenTime,
      overrideCloseTime: form.fullDayClosed ? undefined : form.overrideCloseTime, version: item?.version }
    inFlight.current = true; setBusy(true); setError('')
    try {
      const value = item ? await workingHoursApi.updateException(item.id, input) : await workingHoursApi.createException(input)
      onSaved(value)
    } catch (cause) {
      setError(settingsError(cause, 'Izuzetak nije moguće sačuvati.'))
      if (isAxiosError(cause) && cause.response?.status === 409 && item) { setConflict(true); await onConflict() }
    } finally { inFlight.current = false; setBusy(false) }
  }
  return <>
    <Modal open title={item ? 'Izmeni izuzetak' : 'Novi izuzetak'} titleIcon={<SettingsIcon kind="calendar" />} className="gm-settings-dialog"
      descriptionId={id + '-description'} initialFocusRef={dateRef} returnFocusRef={returnFocusRef} onClose={close} closeDisabled={busy}
      footer={<div className="gm-settings-dialog-actions"><Button type="button" variant="secondary" disabled={busy} onClick={close}>Otkaži</Button>
        <Button type="submit" form={id} className="gm-settings-primary" loading={busy} disabled={conflict}>Sačuvaj izuzetak</Button></div>}>
      <p id={id + '-description'} className="gm-settings-note">Dodajte poseban datum i izmenjeno radno vreme.</p>
      <p className="gm-settings-scope">{item?.locationId ? `Izuzetak lokala: ${locationName || 'izabrani lokal'}` : 'Izuzetak standardnog rasporeda igraonice'}</p>
      <form id={id} className="gm-settings-form" onSubmit={submit}>
        <div className="gm-settings-form-wide"><FormField label="Datum *" htmlFor={id + '-date'}><Input ref={dateRef} id={id + '-date'} type="date"
          required min={addCalendarDays(today, 1)} value={form.date} disabled={busy} onChange={event => change({ date: event.target.value })} /></FormField></div>
        <div className="gm-settings-form-wide"><FormField label="Opis" htmlFor={id + '-note'} hint={`${form.description.length}/500`}>
          <Textarea id={id + '-note'} rows={3} maxLength={500} value={form.description} disabled={busy} onChange={event => change({ description: event.target.value })} /></FormField></div>
        <div className="gm-settings-form-wide gm-settings-form-toggle"><SettingsSwitch label="Ceo dan zatvoreno" checked={form.fullDayClosed} disabled={busy}
          onChange={fullDayClosed => change({ fullDayClosed })} /><small>{form.fullDayClosed ? 'Igraonica ne radi tokom izabranog datuma.' : 'Unesite posebno radno vreme za izabrani datum.'}</small></div>
        {!form.fullDayClosed && <>
          <FormField label="Vreme otvaranja *" htmlFor={id + '-open'}><Input id={id + '-open'} type="time" step="60" required value={form.overrideOpenTime} disabled={busy}
            onChange={event => change({ overrideOpenTime: event.target.value })} /></FormField>
          <FormField label="Vreme zatvaranja *" htmlFor={id + '-close'}><Input id={id + '-close'} type="time" step="60" required value={form.overrideCloseTime} disabled={busy}
            onChange={event => change({ overrideCloseTime: event.target.value })} /></FormField>
          {form.overrideOpenTime && form.overrideCloseTime && form.overrideCloseTime < form.overrideOpenTime && <div className="gm-settings-form-wide"><Badge tone="info"><SettingsIcon kind="clock" />Prelazi ponoć</Badge></div>}
        </>}
        {error && <p className="error-banner gm-settings-form-wide" role="alert">{error}</p>}
        {conflict && <p className="gm-settings-note gm-settings-form-wide">Aktuelni podaci su osveženi. Zatvorite formu i ponovo otvorite izmenu izuzetka.</p>}
      </form>
    </Modal>
    {confirmationDialog}
  </>
}
