import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent } from 'react'
import { stationApi } from '../api/stationApi'
import { Button, Input, Modal, Select, Textarea } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import type { ApplicationDefinition, ApplicationDefinitionInput, ApplicationProfile, ApplicationProfileInput, ApplicationType, StationOperationalStatus, StationOverview } from '../types/station.types'
import { applicationTypeLabels, operationalLabels, StationIcon, stationError } from './stationPresentation'

function useStationSave(save: () => Promise<unknown>, onSaved: () => void, message: string) {
  const client = useQueryClient(), toast = useToast(), inFlight = useRef(false)
  const mutation = useMutation({ mutationFn: save, onSuccess: async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['stations'] }), client.invalidateQueries({ queryKey: ['gaming-operations'] })])
    toast(message, 'success'); onSaved()
  }, onError: () => { void client.invalidateQueries({ queryKey: ['stations'] }); void client.invalidateQueries({ queryKey: ['gaming-operations'] }) },
  onSettled: () => { inFlight.current = false } })
  return { ...mutation, submit: () => { if (!inFlight.current) { inFlight.current = true; mutation.mutate() } } }
}
function SaveFooter({ id, busy, disabled, onClose, label = 'Sačuvaj' }: { id: string; busy: boolean; disabled?: boolean; onClose: () => void; label?: string }) {
  return <div className="dialog-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Otkaži</Button>
    <Button type="submit" form={id} loading={busy} disabled={disabled}>{label}</Button></div>
}
export function StationConfigurationDialog({ station, profiles, onClose }: { station: StationOverview; profiles: ApplicationProfile[]; onClose: () => void }) {
  const id = useId(), [status, setStatus] = useState(station.operationalStatus), [profile, setProfile] = useState(station.applicationProfileId ?? '')
  const [enabled, setEnabled] = useState(station.clientEnabled), [heartbeat, setHeartbeat] = useState(station.heartbeatIntervalSeconds), [grace, setGrace] = useState(station.offlineGraceSeconds)
  const timingError = grace < heartbeat
  const save = useStationSave(() => stationApi.saveStation(station.resourceId, { operationalStatus: status, applicationProfileId: profile || undefined,
    clientEnabled: enabled, heartbeatIntervalSeconds: heartbeat, offlineGraceSeconds: grace, version: station.version }), onClose, 'Podešavanja stanice su sačuvana.')
  const busy = save.isPending
  return <Modal open title={`Podesi stanicu · ${station.resourceName}`} className="gm-stations-dialog" titleIcon={<StationIcon kind="settings" />}
    closeDisabled={busy} onClose={onClose} footer={<SaveFooter id={id} busy={busy} disabled={timingError} onClose={onClose} />}>
    <form id={id} className="gm-stations-form" onSubmit={event => { event.preventDefault(); if (!busy && !timingError) save.submit() }}>
      {save.isError && <p className="error-banner gm-stations-full" role="alert">{stationError(save.error, 'Podešavanja stanice nije moguće sačuvati.')}</p>}
      <p className="gm-stations-form-note gm-stations-full">{station.resourceCode} · Konfiguracija v{station.configurationVersion}. Promena podešavanja ne potvrđuje lokalno zaključavanje računara.</p>
      <label>Operativno stanje<Select value={status} onChange={event => setStatus(event.target.value as StationOperationalStatus)} disabled={busy}>
        {Object.entries(operationalLabels).map(([value, label]) => <option key={value} value={value} disabled={station.operationalStatus === 'RETIRED' && value !== 'RETIRED'}>{label}</option>)}</Select></label>
      <label>Profil aplikacija<Select value={profile} required={enabled} disabled={busy} onChange={event => setProfile(event.target.value)}><option value="">Bez profila</option>
        {profiles.filter(value => value.active).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
        {profile && !profiles.some(value => value.id === profile && value.active) && <option value={profile} disabled>Dodeljeni profil nije aktivan ili dostupan</option>}
      </Select></label>
      <label>Interval heartbeat-a (sekunde)<Input required type="number" min={1} value={heartbeat} disabled={busy} onChange={event => setHeartbeat(Number(event.target.value))} /></label>
      <label>Offline grace period (sekunde)<Input required type="number" min={1} value={grace} disabled={busy} aria-invalid={timingError} aria-describedby={timingError ? `${id}-timing` : undefined} onChange={event => setGrace(Number(event.target.value))} /></label>
      {timingError && <p id={`${id}-timing`} className="gm-stations-field-error gm-stations-full" role="alert">Tolerancija prekida veze mora biti najmanje jednaka intervalu heartbeat-a.</p>}
      <label className="gm-stations-toggle gm-stations-full"><input type="checkbox" checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} />Gaming Client integracija uključena</label>
    </form>
  </Modal>
}
const emptyDefinition: ApplicationDefinitionInput = { code: '', name: '', type: 'GAME', executablePath: '', publisher: '', publisherCertificateThumbprint: '', executableSha256: '', minimumFileVersion: '', defaultArguments: '', active: true }
export function ApplicationDialog({ value, onClose }: { value: ApplicationDefinition | null; onClose: () => void }) {
  const id = useId(), [form, setForm] = useState<ApplicationDefinitionInput>(value ? {
    code: value.code, name: value.name, type: value.type, executablePath: value.executablePath, publisher: value.publisher,
    publisherCertificateThumbprint: value.publisherCertificateThumbprint, executableSha256: value.executableSha256,
    minimumFileVersion: value.minimumFileVersion, defaultArguments: value.defaultArguments, active: value.active,
  } : emptyDefinition)
  const save = useStationSave(() => {
    const request = { ...form, publisher: form.publisher?.trim() || undefined, publisherCertificateThumbprint: form.publisherCertificateThumbprint?.trim() || undefined,
      executableSha256: form.executableSha256?.trim() || undefined, minimumFileVersion: form.minimumFileVersion?.trim() || undefined, defaultArguments: form.defaultArguments?.trim() || undefined, version: value?.version }
    return value ? stationApi.updateDefinition(value.id, request) : stationApi.createDefinition(request)
  }, onClose, 'Aplikacija je sačuvana.')
  const busy = save.isPending, update = <K extends keyof ApplicationDefinitionInput>(key: K, input: ApplicationDefinitionInput[K]) => setForm(current => ({ ...current, [key]: input }))
  const identityMissing = !form.publisher?.trim() && !form.publisherCertificateThumbprint?.trim() && !form.executableSha256?.trim()
  return <Modal open title={value ? 'Izmeni aplikaciju' : 'Nova aplikacija'} className="gm-stations-dialog" titleIcon={<StationIcon kind="apps" />}
    closeDisabled={busy} onClose={onClose} footer={<SaveFooter id={id} busy={busy} disabled={identityMissing} onClose={onClose} />}>
    <form id={id} className="gm-stations-form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (!busy && !identityMissing) save.submit() }}>
      {save.isError && <p className="error-banner gm-stations-full" role="alert">{stationError(save.error, 'Aplikaciju nije moguće sačuvati.')}</p>}
      <label>Kod<Input required maxLength={60} value={form.code} disabled={busy} onChange={event => update('code', event.target.value)} /></label>
      <label>Naziv<Input required maxLength={120} value={form.name} disabled={busy} onChange={event => update('name', event.target.value)} /></label>
      <label>Tip<Select value={form.type} disabled={busy} onChange={event => update('type', event.target.value as ApplicationType)}>{Object.entries(applicationTypeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</Select></label>
      <label>Putanja izvršne datoteke<Input required maxLength={500} placeholder="C:\Games\game.exe" value={form.executablePath} disabled={busy} onChange={event => update('executablePath', event.target.value)} /></label>
      <label>Izdavač<Input maxLength={255} value={form.publisher ?? ''} disabled={busy} onChange={event => update('publisher', event.target.value)} /></label>
      <label>Otisak sertifikata izdavača<Input maxLength={64} pattern="[a-fA-F0-9]{40,64}" value={form.publisherCertificateThumbprint ?? ''} disabled={busy} onChange={event => update('publisherCertificateThumbprint', event.target.value)} /></label>
      <label className="gm-stations-full">SHA-256<Input maxLength={64} pattern="[a-fA-F0-9]{64}" value={form.executableSha256 ?? ''} disabled={busy} onChange={event => update('executableSha256', event.target.value)} /></label>
      <p className="gm-stations-form-note gm-stations-full">Obavezan je najmanje jedan podatak za proveru identiteta: izdavač, sertifikat ili SHA-256. Izvršna datoteka mora imati apsolutnu Windows .exe putanju.</p>
      <label>Minimalna verzija datoteke<Input placeholder="1.2.3.4" pattern="[0-9]+(\.[0-9]+){1,3}" value={form.minimumFileVersion ?? ''} disabled={busy} onChange={event => update('minimumFileVersion', event.target.value)} /></label>
      <label>Argumenti<Input maxLength={1000} value={form.defaultArguments ?? ''} disabled={busy} onChange={event => update('defaultArguments', event.target.value)} /></label>
      <label className="gm-stations-toggle gm-stations-full"><input type="checkbox" checked={form.active} disabled={busy} onChange={event => update('active', event.target.checked)} />Aplikacija aktivna</label>
    </form>
  </Modal>
}
type ProfileEntry = ApplicationProfileInput['entries'][number]
export function ApplicationProfileDialog({ value, definitions, onClose }: { value: ApplicationProfile | null; definitions: ApplicationDefinition[]; onClose: () => void }) {
  const id = useId(), [code, setCode] = useState(value?.code ?? ''), [name, setName] = useState(value?.name ?? ''), [description, setDescription] = useState(value?.description ?? '')
  const [active, setActive] = useState(value?.active ?? true)
  const [entries, setEntries] = useState<ProfileEntry[]>(value?.entries.map(entry => ({ applicationDefinitionId: entry.applicationDefinitionId, requiredProcess: entry.requiredProcess,
    autoStart: entry.autoStart, launchOrder: entry.launchOrder, dependencyGroup: entry.dependencyGroup, argumentsOverride: entry.argumentsOverride })) ?? [])
  const hasGame = entries.some(entry => definitions.find(definition => definition.id === entry.applicationDefinitionId)?.type === 'GAME')
  const unavailable = entries.some(entry => !definitions.some(definition => definition.id === entry.applicationDefinitionId && definition.active))
  const save = useStationSave(() => {
    const request: ApplicationProfileInput = { code, name, description: description.trim() || undefined, active, version: value?.version,
      entries: entries.map(entry => ({ ...entry, dependencyGroup: entry.dependencyGroup?.trim() || undefined, argumentsOverride: entry.argumentsOverride?.trim() || undefined })) }
    return value ? stationApi.updateProfile(value.id, request) : stationApi.createProfile(request)
  }, onClose, 'Profil aplikacija je sačuvan.')
  const busy = save.isPending
  function toggle(definition: ApplicationDefinition, checked: boolean) {
    setEntries(current => checked ? [...current, { applicationDefinitionId: definition.id, requiredProcess: definition.type !== 'GAME', autoStart: definition.type !== 'GAME',
      launchOrder: current.reduce((max, entry) => Math.max(max, entry.launchOrder + 1), 0) }] : current.filter(entry => entry.applicationDefinitionId !== definition.id))
  }
  function updateEntry(id: string, changes: Partial<ProfileEntry>) { setEntries(current => current.map(entry => entry.applicationDefinitionId === id ? { ...entry, ...changes } : entry)) }
  return <Modal open title={value ? 'Izmeni profil' : 'Novi profil'} className="gm-stations-dialog gm-stations-profile-dialog" titleIcon={<StationIcon kind="apps" />}
    closeDisabled={busy} onClose={onClose} footer={<SaveFooter id={id} busy={busy} disabled={!hasGame || unavailable} onClose={onClose} label="Sačuvaj profil" />}>
    <form id={id} className="gm-stations-form" onSubmit={event => { event.preventDefault(); if (!busy && hasGame && !unavailable) save.submit() }}>
      {save.isError && <p className="error-banner gm-stations-full" role="alert">{stationError(save.error, 'Profil nije moguće sačuvati.')}</p>}
      <label>Kod<Input required maxLength={60} value={code} disabled={busy} onChange={event => setCode(event.target.value)} /></label>
      <label>Naziv<Input required maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      <label className="gm-stations-full">Opis<Textarea maxLength={500} value={description} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
      <label className="gm-stations-toggle gm-stations-full"><input type="checkbox" checked={active} disabled={busy} onChange={event => setActive(event.target.checked)} />Profil aktivan</label>
      <fieldset className="gm-stations-profile-apps gm-stations-full"><legend>Aplikacije i pravila pokretanja</legend>
        <p className="gm-stations-form-note">Najmanje jedna aktivna igra. Pokretač i pripadajuća igra moraju imati istu grupu zavisnosti.</p>
        {definitions.filter(definition => definition.active || entries.some(entry => entry.applicationDefinitionId === definition.id)).map(definition => {
          const entry = entries.find(entry => entry.applicationDefinitionId === definition.id)
          return <div key={definition.id} className="gm-stations-profile-entry"><label className="gm-stations-toggle"><input type="checkbox" checked={Boolean(entry)} disabled={busy || !definition.active && !entry}
            onChange={event => toggle(definition, event.target.checked)} /><strong>{definition.name}</strong><span>{applicationTypeLabels[definition.type]}{!definition.active && ' · neaktivna'}</span></label>
            {entry && <div className="gm-stations-entry-fields"><label className="gm-stations-toggle"><input type="checkbox" checked={entry.requiredProcess} disabled={busy} onChange={event => updateEntry(definition.id, { requiredProcess: event.target.checked })} />Obavezan proces</label>
              <label className="gm-stations-toggle"><input type="checkbox" checked={entry.autoStart} disabled={busy} onChange={event => updateEntry(definition.id, { autoStart: event.target.checked })} />Automatsko pokretanje</label>
              <label>Redosled pokretanja<Input type="number" required min={0} value={entry.launchOrder} disabled={busy} onChange={event => updateEntry(definition.id, { launchOrder: Number(event.target.value) })} /></label>
              <label>Grupa zavisnosti<Input maxLength={60} pattern="[A-Za-z0-9_\-]+" placeholder="npr. steam-cs2" value={entry.dependencyGroup ?? ''} disabled={busy} onChange={event => updateEntry(definition.id, { dependencyGroup: event.target.value })} /></label>
              <label className="gm-stations-full">Argumenti za ovaj profil<Input maxLength={1000} value={entry.argumentsOverride ?? ''} disabled={busy} onChange={event => updateEntry(definition.id, { argumentsOverride: event.target.value })} /></label>
            </div>}
          </div>
        })}
        {entries.filter(entry => !definitions.some(definition => definition.id === entry.applicationDefinitionId)).map(entry => <div key={entry.applicationDefinitionId} className="gm-stations-profile-entry">
          <span>Nedostupna aplikacija: {value?.entries.find(item => item.applicationDefinitionId === entry.applicationDefinitionId)?.applicationName ?? entry.applicationDefinitionId}</span>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setEntries(current => current.filter(item => item.applicationDefinitionId !== entry.applicationDefinitionId))}>Ukloni iz profila</Button></div>)}
        {!hasGame && <p className="gm-stations-field-error">Izaberite najmanje jednu igru.</p>}
        {unavailable && <p className="gm-stations-field-error" role="alert">Uklonite neaktivne ili nedostupne aplikacije pre čuvanja profila.</p>}
      </fieldset>
    </form>
  </Modal>
}
