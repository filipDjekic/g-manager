import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { resourceApi } from '../api/resourceApi'
import { stationApi } from '../api/stationApi'
import { catalogApi } from '../api/catalogApi'
import { Badge, Button } from '../components/ui'
import type { WorkingHours } from '../types/workingHours.types'
import type { UserResponse } from '../types/user.types'

export function SetupOverview({hours,employees,loaded}:{hours:WorkingHours[];employees:UserResponse[];loaded:boolean}) {
  const locations=useQuery({queryKey:['setup','locations'],queryFn:resourceApi.locations,staleTime:300000})
  const stations=useQuery({queryKey:['stations','overview'],queryFn:stationApi.overview})
  const profiles=useQuery({queryKey:['stations','profiles'],queryFn:stationApi.profiles})
  const catalog=useQuery({queryKey:['setup','services'],queryFn:()=>catalogApi.list({page:0,size:1,type:'SERVICE',active:true,sort:'name',direction:'ASC'})})
  const distribution=useQuery({queryKey:['stations','client-package'],queryFn:stationApi.clientPackage,staleTime:300000})
  const active=locations.data?.find(value=>value.active)
  const areas=useQuery({queryKey:['setup','areas',active?.id],queryFn:()=>resourceApi.areas(active!.id),enabled:!!active})
  const steps=[
    {label:'Lokacija',description:'Adresa i poslovna zona aktivne lokacije',ready:!!active,known:!!locations.data,to:'/resources',error:locations.error,retry:locations.refetch},
    {label:'Zona prve aktivne lokacije',description:'Organizujte prostor i mapu resursa',ready:!!areas.data?.some(v=>v.active),known:!!areas.data||!!locations.data&&!active,to:'/resources',error:areas.error,retry:areas.refetch},
    {label:'Gaming stanice',description:'Povežite fizičke resurse i aktivne profile',ready:!!stations.data?.some(v=>v.stationProfileId&&v.applicationProfileId),known:!!stations.data,to:'/stations',error:stations.error,retry:stations.refetch},
    {label:'Zaposleni',description:'Kreirajte naloge, zatim dodelite lokacije u Mapi resursa',ready:employees.some(v=>v.active),known:loaded,to:'/employees'},
    {label:'Aplikacioni profili',description:'Definišite dozvoljene igre i aplikacije',ready:!!profiles.data?.some(v=>v.active&&v.entries.length),known:!!profiles.data,to:'/stations',error:profiles.error,retry:profiles.refetch},
    {label:'Radno vreme',description:'Nedeljni raspored i izuzeci',ready:hours.some(v=>v.active),known:loaded,to:'#working-hours'},
    {label:'Usluge',description:'Aktivne usluge u katalogu',ready:!!catalog.data?.totalElements,known:!!catalog.data,to:'/catalog',error:catalog.error,retry:catalog.refetch},
    {label:'Produkcijski client paket',description:'Objavljen paket, download i checksum',ready:distribution.data?.status==='RELEASED'&&!!distribution.data.downloadUrl&&!!distribution.data.sha256,known:!!distribution.data,to:'/stations',error:distribution.error,retry:distribution.refetch},
  ]
  return <section className="setup-overview panel"><div className="section-heading"><div><p className="eyebrow">Početno podešavanje</p><h2>Priprema igraonice</h2><p className="search-help">Informativna lista koja ne blokira rad. Za svaku lokaciju proverite stanice i vezu klijenta.</p></div><Badge tone="accent">{steps.filter(s=>s.ready).length} / {steps.length}</Badge></div>
    <ol className="setup-checklist">{steps.map((step,index)=><li key={step.label}><span className="setup-step-number">{String(index+1).padStart(2,'0')}</span><div><Link to={step.to}>{step.label}</Link><small>{step.description}</small></div>
      {step.error?<Button variant="secondary" onClick={()=>step.retry?.()}>Ponovi proveru</Button>:<Badge tone={step.ready?'success':step.known?'warning':'neutral'}>{step.ready?'Podešeno':step.known?'Proverite':'U proveri'}</Badge>}</li>)}</ol>
  </section>
}
