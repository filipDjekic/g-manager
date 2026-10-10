import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { resourceApi } from '../api/resourceApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Button, EmptyState, ErrorState, Input, Select, Skeleton } from '../components/ui'
import { businessInstantToLocal, businessLocalToInstant } from '../reservations/dateTime'
import { ResourceEditor, type ResourceEditorKind } from '../resources/ResourceEditor'
import { ResourceEmployees } from '../resources/ResourceEmployees'
import { LocationEmployees } from '../resources/LocationEmployees'
import { ResourceDetails } from '../resources/ResourceDetails'
import { ResourceFloorMap } from '../resources/ResourceFloorMap'
import { ResourceIcon } from '../resources/ResourceIcon'
import { ResourceMenu, type ResourceMenuAction } from '../resources/ResourceMenu'
import { ResourceTable } from '../resources/ResourceTable'
import { completeGeometry, type MapResource } from '../resources/floorPlanGeometry'
import type { LocationView, AreaView, ResourceView } from '../types/resource.types'
import '../resources/resources.css'

type EditorState={kind:ResourceEditorKind;initial?:LocationView|AreaView|ResourceView;areaId?:string}
export function ResourcesPage() {
  const navigate=useNavigate(),actor=useAuthStore(state=>state.user),manage=hasCapability(actor,'RESOURCE_MANAGE')&&actor?.role!=='CUSTOMER'
  const [params,setParams]=useSearchParams(),[editing,setEditing]=useState(false),[savedNotice,setSavedNotice]=useState('')
  const chosenLocation=params.get('locationId')??'',chosenArea=params.get('areaId')??''
  const [start,setStart]=useState(()=>businessInstantToLocal(new Date(Date.now()+3600000).toISOString()))
  const [editor,setEditor]=useState<EditorState|null>(null),[showEmployees,setShowEmployees]=useState(false)
  const [resourceEmployees,setResourceEmployees]=useState<{id:string;name:string}|null>(null)
  const locations=useQuery({queryKey:['resources','locations'],queryFn:resourceApi.locations,enabled:!editing})
  const visibleLocations=useMemo(()=>locations.data?.filter(value=>manage||value.active)??[],[locations.data,manage])
  const locationId=visibleLocations.some(value=>value.id===chosenLocation)?chosenLocation:visibleLocations[0]?.id??''
  const location=visibleLocations.find(value=>value.id===locationId)
  const areas=useQuery({queryKey:['resources','areas',locationId],queryFn:()=>resourceApi.areas(locationId),enabled:!!locationId&&!editing})
  const visibleAreas=useMemo(()=>areas.data?.filter(value=>value.locationId===locationId&&(manage||value.active))??[],[areas.data,manage,locationId])
  const areaId=chosenArea==='all'?'':visibleAreas.some(value=>value.id===chosenArea)?chosenArea:visibleAreas[0]?.id??''
  const area=visibleAreas.find(value=>value.id===areaId)
  const interval=useMemo(()=>{try{const from=businessLocalToInstant(start);return{from,to:new Date(Date.parse(from)+3600000).toISOString()}}catch{return null}},[start])
  const availability=useQueries({queries:visibleAreas.map(value=>({queryKey:['resources','availability',value.id,start],queryFn:()=>resourceApi.availability(value.id,interval!.from,interval!.to),enabled:!!interval&&!editing}))})
  const metadata=useQueries({queries:visibleAreas.map(value=>({queryKey:['resources','list',value.id],queryFn:()=>resourceApi.resources(value.id),enabled:hasCapability(actor,'RESOURCE_READ')&&!editing}))})
  const floorPlan=useQuery({queryKey:['resources','floor-plan',locationId],queryFn:()=>resourceApi.floorPlan(locationId),enabled:!!locationId&&!editing})
  const allMetadata=metadata.flatMap(query=>query.data??[])
  const resources:MapResource[]=availability.flatMap((query,index)=>(query.data??[]).map(value=>{
    const details=metadata[index]?.data?.find(item=>item.id===value.id)
    return{...value,...details,areaName:visibleAreas[index].name,details}
  }))
  const geometry=useMemo(()=>floorPlan.data?completeGeometry({...floorPlan.data.geometry,rooms:floorPlan.data.geometry.rooms.filter(room=>!room.areaId||visibleAreas.some(value=>value.id===room.areaId))},visibleAreas,allMetadata):null,[floorPlan.data,visibleAreas,allMetadata])
  const selected=resources.find(value=>value.id===params.get('resourceId'))
  const availabilityError=availability.find(query=>query.error)?.error,metadataError=metadata.some(query=>query.error)
  const mapLoading=floorPlan.isLoading||availability.some(query=>query.isLoading)
  const mapReady=!!floorPlan.data&&!!geometry&&!!interval&&availability.every(query=>!!query.data)
  const canEdit=manage&&mapReady&&!areas.isLoading&&!areas.error&&!floorPlan.error&&!availabilityError&&visibleAreas.length>0&&!metadataError&&metadata.every(query=>!!query.data&&!query.isFetching)
  useEffect(()=>{setEditing(false);setEditor(null);setShowEmployees(false);setResourceEmployees(null)},[chosenLocation,chosenArea])

  function setLocation(id:string) {
    setParams(current=>{const next=new URLSearchParams(current);next.set('locationId',id);next.delete('areaId');next.delete('resourceId');next.delete('resourcePage');return next})
    setShowEmployees(false);setResourceEmployees(null);setSavedNotice('')
  }
  function setArea(id:string) {
    setParams(current=>{const next=new URLSearchParams(current);next.set('areaId',id||'all');next.delete('resourceId');next.delete('resourcePage');return next});setSavedNotice('')
  }
  function details(id:string|null) {
    setParams(current=>{const next=new URLSearchParams(current);if(id)next.set('resourceId',id);else next.delete('resourceId');return next},{replace:true})
  }
  function actions(value:MapResource):ResourceMenuAction[] {
    const result:ResourceMenuAction[]=[{label:'Detalji',onClick:()=>details(value.id)}]
    if(actor?.role==='CUSTOMER') {
      if(hasCapability(actor,'RESERVATION_READ_OWN')&&['AVAILABLE','OCCUPIED'].includes(value.status)) {
        const book=hasCapability(actor,'RESERVATION_CREATE')&&value.details?.bookable===true&&value.details.active
        if(book)result.push({label:'Zakaži termin',onClick:()=>navigate(`/my-reservations?serviceId=${value.serviceId}&resourceId=${value.id}`)})
        else result.push({label:'Moje rezervacije',onClick:()=>navigate('/my-reservations')})
      }
      return result
    }
    if(value.type==='GAMING_PC'&&hasCapability(actor,'GAMING_SESSION_READ'))result.push({label:'Otvori operativu',onClick:()=>navigate(`/gaming-sessions?stationId=${value.id}`)})
    else if(hasCapability(actor,'RESERVATION_READ_ALL'))result.push({label:'Otvori kalendar',onClick:()=>navigate(`/calendar?resourceId=${value.id}`)})
    if(manage) {
      result.push({label:'Podesi resurs',disabled:!value.details,onClick:()=>{if(value.details){details(null);setEditor({kind:'RESOURCE',initial:value.details,areaId:value.areaId})}}})
      result.push({label:'Zaposleni na resursu',onClick:()=>{details(null);setResourceEmployees({id:value.id,name:value.name})}})
    }
    return result
  }
  const managementActions:ResourceMenuAction[]=[
    {label:'Nova lokacija',onClick:()=>setEditor({kind:'LOCATION'})},
    {label:'Uredi lokaciju',disabled:!location,onClick:()=>setEditor({kind:'LOCATION',initial:location})},
    {label:'Nova zona',disabled:!locationId,onClick:()=>setEditor({kind:'AREA'})},
    {label:'Uredi zonu',disabled:!area,onClick:()=>setEditor({kind:'AREA',initial:area})},
    {label:'Novi resurs',disabled:!area,onClick:()=>setEditor({kind:'RESOURCE',areaId})},
    {label:'Uredi mapu',disabled:!canEdit,onClick:()=>{details(null);setEditing(true);setSavedNotice('')}},
  ]
  return <main className="workspace resource-workspace">
    <header className="resource-page-header"><span className="resource-header-icon"><ResourceIcon/></span><div><h1>Mapa resursa</h1><p>Vizuelni prikaz i upravljanje rasporedom lokala, zona i resursa.</p></div></header>
    {locations.isLoading?<Skeleton lines={4} label="Učitavanje lokacija"/>:locations.error?<ErrorState message={apiErrorMessage(locations.error,'Lokacije nisu dostupne.')} action={<Button onClick={()=>void locations.refetch()}>Pokušaj ponovo</Button>}/>:!visibleLocations.length?<EmptyState title="Nema dostupnih lokacija" description="Dodajte lokaciju, zatim zone i resurse." action={manage&&<Button onClick={()=>setEditor({kind:'LOCATION'})}>Dodaj prvu lokaciju</Button>}/>:<>
      <section className="resource-context-panel" aria-label="Izbor prostora i intervala">
        <div className="resource-context-fields"><label>Lokal<Select value={locationId} disabled={editing} onChange={event=>setLocation(event.target.value)}>{visibleLocations.map(value=><option key={value.id} value={value.id}>{value.name}{!value.active?' · neaktivan':''}</option>)}</Select></label>
          <label>Zona<Select value={areaId||'all'} disabled={editing||areas.isLoading||!visibleAreas.length} onChange={event=>setArea(event.target.value)}><option value="all">Sve zone</option>{visibleAreas.map(value=><option key={value.id} value={value.id}>{value.name}{!value.active?' · neaktivna':''}</option>)}</Select></label>
          <label>Početak intervala<Input type="datetime-local" required value={start} disabled={editing} onChange={event=>{setStart(event.target.value);details(null)}}/></label>
        </div>
        {manage&&<div className="resource-context-actions"><Button variant="secondary" disabled={editing} onClick={()=>setShowEmployees(true)}>Zaposleni na lokaciji</Button><ResourceMenu label="Upravljanje prostorom" disabled={editing} actions={managementActions}>Upravljaj prostorom <span aria-hidden="true">⌄</span></ResourceMenu></div>}
        <p className="resource-interval-note">Dostupnost za izabrani početak i narednih 60 minuta · Europe/Belgrade.{manage&&!area&&' Za novi resurs ili izmenu zone izaberite pojedinačnu zonu.'}</p>
      </section>
      {savedNotice&&<p className="resource-save-notice" role="status">{savedNotice}</p>}
      {areas.isLoading?<Skeleton lines={3} label="Učitavanje zona"/>:areas.error?<ErrorState message={apiErrorMessage(areas.error,'Zone nisu dostupne.')} action={<Button onClick={()=>void areas.refetch()}>Pokušaj ponovo</Button>}/>:!visibleAreas.length?<EmptyState title="Lokacija nema dostupne zone" description="Dodajte zonu ili izaberite drugu lokaciju." action={manage&&<Button onClick={()=>setEditor({kind:'AREA'})}>Dodaj zonu</Button>}/>:!interval?<ErrorState title="Izaberite početak intervala" message="Unesite validan datum i vreme za proveru dostupnosti."/>:mapLoading?<Skeleton lines={6} label="Učitavanje mape i dostupnosti"/>:floorPlan.error||availabilityError?<ErrorState message={apiErrorMessage(floorPlan.error??availabilityError,'Mapu i dostupnost nije moguće učitati.')} action={<Button onClick={()=>{void floorPlan.refetch();availability.forEach(query=>void query.refetch())}}>Pokušaj ponovo</Button>}/>:mapReady&&floorPlan.data&&geometry&&<>
        {metadataError&&<ErrorState title="Dodatna podešavanja nisu dostupna" message="Dostupnost je prikazana. Uređivanje mape i podešavanje resursa zahtevaju učitana podešavanja." action={<Button variant="secondary" onClick={()=>metadata.forEach(query=>void query.refetch())}>Ponovo učitaj podešavanja</Button>}/>}
        <ResourceFloorMap key={`${locationId}:${areaId}:${editing?'edit':'view'}`} plan={floorPlan.data} geometry={geometry} areas={visibleAreas} resources={resources} areaId={areaId} editing={editing&&manage} onFinish={()=>setEditing(false)} onDetails={id=>{if(!editing)details(id)}} onSaved={()=>setSavedNotice('Raspored prostora i pozicije resursa su sačuvani.')}/>
        {!resources.length&&!editing&&<EmptyState title="Prostor nema resurse" description="Mapa i dalje može da se uređuje. Za novi resurs izaberite zonu." action={manage&&area&&<Button onClick={()=>setEditor({kind:'RESOURCE',areaId})}>Dodaj prvi resurs</Button>}/>}
        {!editing&&<ResourceTable resources={resources} areaId={areaId} actions={actions}/>}
      </>}
    </>}
    {selected&&!editing&&<ResourceDetails resource={selected} actions={actions(selected)} metadataError={metadataError} onClose={()=>details(null)}/>}
    {editor&&manage&&<ResourceEditor key={`${editor.kind}:${editor.initial?.id??'new'}`} {...editor} locationId={locationId} areaId={editor.areaId??areaId} onClose={()=>setEditor(null)} onSaved={id=>{if(editor.kind==='LOCATION')setLocation(id);else if(editor.kind==='AREA')setArea(id)}}/>}
    {resourceEmployees&&manage&&<ResourceEmployees resourceId={resourceEmployees.id} resourceName={resourceEmployees.name} onClose={()=>setResourceEmployees(null)}/>}
    {showEmployees&&location&&manage&&<LocationEmployees locationId={location.id} locationName={location.name} onClose={()=>setShowEmployees(false)}/>}
  </main>
}
