import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { stationApi } from '../api/stationApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Button, EmptyState, ErrorState, Modal, Skeleton, TableShell } from '../components/ui'
import type { ApplicationDefinition, ApplicationProfile, ApplicationType,
  StationOperationalStatus, StationOverview } from '../types/station.types'

const emptyDefinition = { code:'', name:'', type:'GAME' as ApplicationType, executablePath:'',
  publisher:'', executableSha256:'', defaultArguments:'', active:true }

export function StationsPage() {
  const user = useAuthStore((state) => state.user)
  const manage = hasCapability(user, 'APPLICATION_PROFILE_MANAGE')
  const maintain = hasCapability(user, 'STATION_MAINTENANCE')
  const stations = useQuery({ queryKey:['stations'], queryFn:stationApi.overview })
  const definitions = useQuery({ queryKey:['stations','applications'], queryFn:stationApi.definitions })
  const profiles = useQuery({ queryKey:['stations','profiles'], queryFn:stationApi.profiles })
  const [stationEdit, setStationEdit] = useState<StationOverview|null>(null)
  const [definitionEdit, setDefinitionEdit] = useState<ApplicationDefinition|null|undefined>(undefined)
  const [profileEdit, setProfileEdit] = useState<ApplicationProfile|null|undefined>(undefined)
  const [definitionForm, setDefinitionForm] = useState(emptyDefinition)
  const [selectedApps, setSelectedApps] = useState<string[]>([])
  const [profileCode, setProfileCode] = useState('')
  const [profileName, setProfileName] = useState('')
  const [profileDescription, setProfileDescription] = useState('')
  const [error, setError] = useState('')

  const refresh = async () => { await Promise.all([stations.refetch(), definitions.refetch(), profiles.refetch()]) }
  const openDefinition = (value?:ApplicationDefinition) => {
    setDefinitionEdit(value ?? null); setDefinitionForm(value ? { code:value.code,name:value.name,type:value.type,
      executablePath:value.executablePath,publisher:value.publisher ?? '',executableSha256:value.executableSha256 ?? '',
      defaultArguments:value.defaultArguments ?? '',active:value.active } : emptyDefinition)
  }
  const openProfile = (value?:ApplicationProfile) => {
    setProfileEdit(value ?? null); setProfileCode(value?.code ?? ''); setProfileName(value?.name ?? '')
    setProfileDescription(value?.description ?? ''); setSelectedApps(value?.entries.map((entry) => entry.applicationDefinitionId) ?? [])
  }
  async function saveDefinition(event:FormEvent) {
    event.preventDefault(); setError('')
    const request = { ...definitionForm, publisher:definitionForm.publisher || undefined,
      executableSha256:definitionForm.executableSha256 || undefined,
      defaultArguments:definitionForm.defaultArguments || undefined, version:definitionEdit?.version }
    try { if (definitionEdit) await stationApi.updateDefinition(definitionEdit.id, request)
      else await stationApi.createDefinition(request); setDefinitionEdit(undefined); await refresh() }
    catch (cause) { setError(apiErrorMessage(cause, 'Aplikaciju nije moguće sačuvati.')) }
  }
  async function saveProfile(event:FormEvent) {
    event.preventDefault(); setError('')
    const selected = definitions.data?.filter((value) => selectedApps.includes(value.id)) ?? []
    const request = { code:profileCode,name:profileName,description:profileDescription || undefined,active:true,
      version:profileEdit?.version,entries:selected.map((value,index) => ({ applicationDefinitionId:value.id,
        requiredProcess:value.type !== 'GAME',autoStart:value.type !== 'GAME',launchOrder:index })) }
    try { if (profileEdit) await stationApi.updateProfile(profileEdit.id,request)
      else await stationApi.createProfile(request); setProfileEdit(undefined); await refresh() }
    catch (cause) { setError(apiErrorMessage(cause, 'Profil nije moguće sačuvati.')) }
  }
  async function saveStation(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!stationEdit) return; setError('')
    const data = new FormData(event.currentTarget)
    try { await stationApi.saveStation(stationEdit.resourceId,{ operationalStatus:data.get('status') as StationOperationalStatus,
      applicationProfileId:String(data.get('profile') || '') || undefined,clientEnabled:data.get('clientEnabled') === 'on',
      heartbeatIntervalSeconds:Number(data.get('heartbeat')),offlineGraceSeconds:Number(data.get('grace')),
      version:stationEdit.version }); setStationEdit(null); await refresh() }
    catch (cause) { setError(apiErrorMessage(cause, 'Stanicu nije moguće sačuvati.')) }
  }
  async function deleteDefinition(value:ApplicationDefinition) {
    if (!window.confirm(`Obrisati aplikaciju ${value.name}?`)) return
    try { await stationApi.deleteDefinition(value.id,value.version); await refresh() }
    catch (cause) { setError(apiErrorMessage(cause,'Aplikaciju nije moguće obrisati.')) }
  }
  async function deleteProfile(value:ApplicationProfile) {
    if (!window.confirm(`Obrisati profil ${value.name}?`)) return
    try { await stationApi.deleteProfile(value.id,value.version); await refresh() }
    catch (cause) { setError(apiErrorMessage(cause,'Profil nije moguće obrisati.')) }
  }

  return <main className="workspace"><div className="page-heading"><div><p className="eyebrow">Gaming operativa</p>
    <h1>Gaming stanice</h1></div>{manage && <div className="form-actions">
      <Button variant="secondary" onClick={() => openDefinition()}>Nova aplikacija</Button>
      <Button onClick={() => openProfile()}>Novi profil</Button></div>}</div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {stations.isLoading ? <Skeleton lines={6} label="Učitavanje stanica" /> : stations.error ?
      <ErrorState message={apiErrorMessage(stations.error,'Stanice nisu dostupne.')} action={<Button onClick={() => stations.refetch()}>Pokušaj ponovo</Button>} /> :
      !stations.data?.length ? <EmptyState title="Nema gaming PC resursa" description="Prvo kreirajte GAMING_PC fizički resurs." /> :
      <TableShell label="Gaming stanice"><table className="data-table"><thead><tr><th>Stanica</th><th>Stanje</th>
        <th>Application profil</th><th>Client</th>{maintain && <th>Akcija</th>}</tr></thead><tbody>
        {stations.data.map((station) => <tr key={station.resourceId}><td><strong>{station.resourceName}</strong><small>{station.resourceCode}</small></td>
          <td><span className={`status status-${station.effectiveStatus.toLowerCase()}`}>{station.effectiveStatus}</span></td>
          <td>{station.applicationProfileName ?? 'Nije dodeljen'}{station.configurationVersion > 0 && <small> v{station.configurationVersion}</small>}</td>
          <td>{station.clientEnabled ? station.lastHeartbeatAt ? `Poslednji heartbeat ${station.lastHeartbeatAt}` : 'Čeka prvi heartbeat' : 'Isključen'}</td>
          {maintain && <td><Button variant="secondary" onClick={() => setStationEdit(station)}>Podesi</Button></td>}</tr>)}</tbody></table></TableShell>}

    {manage && <section className="panel"><h2>Allowed applications</h2>
      {definitions.data?.map((value) => <article className="exception-row" key={value.id}><div><strong>{value.name}</strong>
        <p>{value.type} · {value.executablePath}</p><small>{value.publisher || value.executableSha256}</small></div>
        <div className="form-actions"><Button variant="secondary" onClick={() => openDefinition(value)}>Izmeni</Button>
          <Button variant="danger" onClick={() => void deleteDefinition(value)}>Obriši</Button></div></article>)}</section>}
    {manage && <section className="panel"><h2>Application profili</h2>
      {profiles.data?.map((value) => <article className="exception-row" key={value.id}><div><strong>{value.name}</strong>
        <p>Konfiguracija v{value.configurationVersion} · {value.entries.map((entry) => `${entry.applicationName} (${entry.applicationType})`).join(', ')}</p></div>
        <div className="form-actions"><Button variant="secondary" onClick={() => openProfile(value)}>Izmeni</Button>
          <Button variant="danger" onClick={() => void deleteProfile(value)}>Obriši</Button></div></article>)}</section>}

    <Modal open={stationEdit !== null} title={`Podesi ${stationEdit?.resourceName ?? 'stanicu'}`} onClose={() => setStationEdit(null)}>
      {stationEdit && <form className="form-grid" onSubmit={saveStation}><label>Operativno stanje<select name="status" defaultValue={stationEdit.operationalStatus}>
        <option value="AVAILABLE">AVAILABLE</option><option value="MAINTENANCE">MAINTENANCE</option><option value="RETIRED">RETIRED</option></select></label>
        <label>Application profil<select name="profile" defaultValue={stationEdit.applicationProfileId ?? ''}><option value="">Bez profila</option>
          {profiles.data?.filter((value) => value.active).map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
        <label><input name="clientEnabled" type="checkbox" defaultChecked={stationEdit.clientEnabled} /> Client enabled</label>
        <label>Heartbeat sekunde<input name="heartbeat" type="number" min={1} defaultValue={stationEdit.heartbeatIntervalSeconds} /></label>
        <label>Offline grace sekunde<input name="grace" type="number" min={1} defaultValue={stationEdit.offlineGraceSeconds} /></label>
        <Button type="submit">Sačuvaj</Button></form>}
    </Modal>
    <Modal open={definitionEdit !== undefined} title={definitionEdit ? 'Izmeni aplikaciju' : 'Nova aplikacija'} onClose={() => setDefinitionEdit(undefined)}>
      <form className="form-grid" onSubmit={saveDefinition}><label>Kod<input required value={definitionForm.code} onChange={(e) => setDefinitionForm({...definitionForm,code:e.target.value})} /></label>
        <label>Naziv<input required value={definitionForm.name} onChange={(e) => setDefinitionForm({...definitionForm,name:e.target.value})} /></label>
        <label>Tip<select value={definitionForm.type} onChange={(e) => setDefinitionForm({...definitionForm,type:e.target.value as ApplicationType})}><option>LAUNCHER</option><option>GAME</option><option>HELPER</option></select></label>
        <label>Executable path<input required placeholder="C:\\Games\\game.exe" value={definitionForm.executablePath} onChange={(e) => setDefinitionForm({...definitionForm,executablePath:e.target.value})} /></label>
        <label>Publisher<input value={definitionForm.publisher} onChange={(e) => setDefinitionForm({...definitionForm,publisher:e.target.value})} /></label>
        <label>SHA-256<input value={definitionForm.executableSha256} onChange={(e) => setDefinitionForm({...definitionForm,executableSha256:e.target.value})} /></label>
        <label>Argumenti<input value={definitionForm.defaultArguments} onChange={(e) => setDefinitionForm({...definitionForm,defaultArguments:e.target.value})} /></label>
        <Button type="submit">Sačuvaj</Button></form>
    </Modal>
    <Modal open={profileEdit !== undefined} title={profileEdit ? 'Izmeni profil' : 'Novi profil'} onClose={() => setProfileEdit(undefined)}>
      <form className="form-grid" onSubmit={saveProfile}><label>Kod<input required value={profileCode} onChange={(e) => setProfileCode(e.target.value)} /></label>
        <label>Naziv<input required value={profileName} onChange={(e) => setProfileName(e.target.value)} /></label>
        <label>Opis<textarea value={profileDescription} onChange={(e) => setProfileDescription(e.target.value)} /></label>
        <fieldset><legend>Aplikacije (najmanje jedna GAME)</legend>{definitions.data?.filter((value) => value.active).map((value) =>
          <label key={value.id}><input type="checkbox" checked={selectedApps.includes(value.id)} onChange={(e) => setSelectedApps(e.target.checked ? [...selectedApps,value.id] : selectedApps.filter((id) => id !== value.id))} /> {value.name} ({value.type})</label>)}</fieldset>
        <Button type="submit" disabled={!selectedApps.length}>Sačuvaj profil</Button></form>
    </Modal>
  </main>
}
