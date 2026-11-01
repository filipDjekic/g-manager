import { useEffect, useRef, useState } from 'react'
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { workingHoursApi } from '../api/workingHoursApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, ErrorState, Input, Skeleton, Card, Alert } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import type { DayOfWeek, WorkingHours } from '../types/workingHours.types'
import { SettingsIcon, SettingsSwitch } from './settingsPresentation'
import { days, dayLabels, settingsError, validTime } from './settingsPresentation.model'

type DayDraft = { openTime: string; closeTime: string; active: boolean; version?: number }
const normalizedTime = (value: string) => value.length === 5 ? value + ':00' : value
export function WorkingHoursSettings({ query, onDirtyChange }: { query: UseQueryResult<WorkingHours[]>; onDirtyChange: (count: number) => void }) {
  const actor = useAuthStore(state => state.user), canManage = hasCapability(actor, 'WORKING_HOURS_MANAGE')
  const client = useQueryClient(), toast = useToast(), { confirm, confirmationDialog } = useConfirmDialog()
  const [drafts, setDrafts] = useState<Partial<Record<DayOfWeek, DayDraft>>>({}), [errors, setErrors] = useState<Partial<Record<DayOfWeek, string>>>({})
  const [saving, setSaving] = useState<DayOfWeek | null>(null), inFlight = useRef(false)
  const [savingAll, setSavingAll] = useState(false), [batchResult, setBatchResult] = useState('')
  const count = Object.keys(drafts).length
  useDirtyGuard(count > 0 || savingAll || !!saving, { pending: savingAll || !!saving })
  useEffect(() => { onDirtyChange(count) }, [count, onDirtyChange])
  const update = (day: DayOfWeek, values: Partial<DayDraft>) => {
    const server = query.data?.find(item => item.dayOfWeek === day)
    setDrafts(current => {
      const previous = current[day] ?? { openTime: server?.openTime ?? '', closeTime: server?.closeTime ?? '', active: server?.active ?? false, version: server?.version }
      const next = { ...previous, ...values }, result = { ...current }
      if (server && server.version === next.version && normalizedTime(server.openTime) === normalizedTime(next.openTime) && normalizedTime(server.closeTime) === normalizedTime(next.closeTime) && server.active === next.active) delete result[day]
      else result[day] = next
      return result
    })
    setErrors(current => ({ ...current, [day]: '' }))
  }
  const discard = (day: DayOfWeek) => confirm({ title: 'Poništi izmene dana', description: `Odbacujete nesačuvane izmene za dan: ${dayLabels[day]}.`,
    confirmLabel: 'Poništi izmene', className: 'gm-settings-dialog', onConfirm: async () => {
      const result = await query.refetch(); if (result.error) throw result.error
      setDrafts(current => { const next = { ...current }; delete next[day]; return next })
      setErrors(current => ({ ...current, [day]: '' }))
    }, formatError: cause => settingsError(cause, 'Aktuelni raspored nije moguće učitati.') })
  async function save(day: DayOfWeek, batch = false) {
    const item = drafts[day]
    if (!item || !canManage || inFlight.current || query.isError) return false
    if (!validTime(item.openTime.slice(0, 5)) || !validTime(item.closeTime.slice(0, 5)) || normalizedTime(item.openTime) === normalizedTime(item.closeTime)) {
      setErrors(current => ({ ...current, [day]: 'Unesite oba vremena u formatu HH:mm. Otvaranje i zatvaranje moraju biti različiti.' })); return false
    }
    if (query.data?.find(value => value.dayOfWeek === day)?.version !== item.version) {
      setErrors(current => ({ ...current, [day]: 'Raspored je promenjen u međuvremenu. Učitajte aktuelne podatke pre nove izmene.' })); return false
    }
    inFlight.current = true; setSaving(day)
    try {
      const value = await workingHoursApi.updateDay(day, item)
      client.setQueryData<WorkingHours[]>(['working-hours'], current => [...(current ?? []).filter(row => row.dayOfWeek !== day), value])
      setDrafts(current => { const next = { ...current }; delete next[day]; return next })
      setErrors(current => ({ ...current, [day]: '' }))
      if (!batch) toast(`${dayLabels[day]} je sačuvan.`, 'success')
      void client.invalidateQueries({ queryKey: ['working-hours'] })
      void client.invalidateQueries({ queryKey: ['availability'] })
      void client.invalidateQueries({ queryKey: ['calendar'] })
      void client.invalidateQueries({ queryKey: ['reservations'] })
      return true
    } catch (cause) {
      setErrors(current => ({ ...current, [day]: settingsError(cause, 'Radno vreme nije moguće sačuvati.') }))
      void query.refetch()
      return false
    } finally { inFlight.current = false; setSaving(null) }
  }
  async function saveAll() {
    if (savingAll || inFlight.current || !canManage) return
    setSavingAll(true); setBatchResult('')
    let succeeded = 0, failed = 0
    for (const day of days.filter(day => !!drafts[day])) {
      if (await save(day, true)) succeeded++; else failed++
    }
    setBatchResult('Sačuvano dana: ' + succeeded + (failed ? '. Nije sačuvano: ' + failed + '. Pregledajte poruke uz dane; neuspešne izmene su zadržane.' : '. Sve izmene su sačuvane.'))
    setSavingAll(false)
  }
  return <Card className="gm-settings-section" id="working-hours">
    <header className="gm-settings-section-header"><div><h2>Rad igraonice</h2><p>Definišite standardno radno vreme igraonice.</p></div>
      <div className="ui-actions">{canManage && count > 0 && <Button type="button" loading={savingAll} disabled={!!saving || query.isError} onClick={() => void saveAll()}>Sačuvaj izmenjene dane ({count})</Button>}<Button type="button" variant="secondary" loading={query.isFetching} disabled={(Boolean(saving) || savingAll)} onClick={() => void query.refetch()}><SettingsIcon kind="refresh" />Osveži</Button></div></header>
    {batchResult && <Alert tone="info" role="status">{batchResult}</Alert>}
    {!canManage && <p className="gm-settings-note">Raspored možete pregledati. Za čuvanje je potrebna dozvola za upravljanje.</p>}
    {query.error && <ErrorState message={settingsError(query.error, 'Radno vreme nije moguće učitati.')} action={<Button variant="secondary" onClick={() => void query.refetch()}>Pokušaj ponovo</Button>} />}
    {query.isLoading ? <Skeleton lines={7} label="Učitavanje nedeljnog rasporeda" /> : query.data && <div className="gm-settings-hours">
      <div className="gm-settings-hours-head" aria-hidden="true"><span>Dan</span><span>Status</span><span>Vreme otvaranja</span><span>Vreme zatvaranja</span><span>Rad preko ponoći</span><span>Akcije</span></div>
      {days.map(day => {
        const saved = query.data?.find(item => item.dayOfWeek === day), draft = drafts[day]
        const values = draft ?? { active: saved?.active ?? false, openTime: saved?.openTime ?? '', closeTime: saved?.closeTime ?? '' }
        const overnight = values.closeTime && values.openTime && normalizedTime(values.closeTime) < normalizedTime(values.openTime)
        const conflict = draft && draft.version !== saved?.version
        const disabled = !canManage || (Boolean(saving) || savingAll) || query.isError
        return <article key={day} className={`gm-settings-hour-row${draft ? ' is-dirty' : ''}${!values.active ? ' is-inactive' : ''}`} aria-label={dayLabels[day]}>
          <div className="gm-settings-hour-day"><h3>{dayLabels[day]}</h3>{draft && <small>Nesačuvane izmene</small>}{!saved && <small>Nije konfigurisan</small>}</div>
          <SettingsSwitch label={values.active ? 'Radi' : 'Ne radi'} ariaLabel={`Aktivan dan · ${dayLabels[day]}`} checked={values.active} disabled={disabled}
            onChange={active => update(day, { active })} />
          <label><span>Vreme otvaranja</span><Input type="time" step="60" aria-label={`Vreme otvaranja · ${dayLabels[day]}`} value={values.openTime.slice(0, 5)}
            disabled={disabled || !values.active} onChange={event => update(day, { openTime: event.target.value })} /></label>
          <label><span>Vreme zatvaranja</span><Input type="time" step="60" aria-label={`Vreme zatvaranja · ${dayLabels[day]}`} value={values.closeTime.slice(0, 5)}
            disabled={disabled || !values.active} onChange={event => update(day, { closeTime: event.target.value })} /></label>
          <div className="gm-settings-hour-midnight">{overnight ? <Badge tone="info"><SettingsIcon kind="clock" />Prelazi ponoć</Badge> : <span>{values.openTime && values.closeTime ? 'Istog dana' : '-'}</span>}</div>
          <div className="gm-settings-hour-actions">{canManage && <><Button type="button" loading={saving === day} disabled={disabled || !draft || Boolean(conflict)} onClick={() => void save(day)}>Sačuvaj</Button>
            {draft && <Button type="button" variant="secondary" disabled={(Boolean(saving) || savingAll)} onClick={() => discard(day)}>{conflict ? 'Učitaj aktuelne' : 'Poništi'}</Button>}</>}</div>
          {(errors[day] || conflict) && <Alert tone="danger" className="gm-settings-hour-error" role="alert">{errors[day] || 'Raspored je promenjen. Vaše nesačuvane vrednosti ostaju sačuvane dok ne učitate aktuelne podatke.'}</Alert>}
        </article>
      })}
    </div>}
    <aside className="gm-settings-info"><SettingsIcon kind="info" /><div><h3>Rad preko ponoći</h3><p>Ako je vreme zatvaranja ranije od otvaranja, radno vreme se nastavlja narednog dana.</p><small>Raspored se čuva po danima. Isključivanje dana čuva njegova vremena otvaranja i zatvaranja.</small></div></aside>
    {confirmationDialog}
  </Card>
}
