import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { resourceApi } from '../api/resourceApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { businessInstantToLocal, businessLocalToInstant } from '../reservations/dateTime'
import { ResourceEditor, type ResourceEditorKind } from '../resources/ResourceEditor'
import { LocationEmployees } from '../resources/LocationEmployees'
import type { LocationView, AreaView, ResourceView, ResourceAvailability } from '../types/resource.types'

const labels:Record<ResourceAvailability['status'],string>={AVAILABLE:'Slobodno',OCCUPIED:'Zauzeto',INACTIVE:'Van funkcije',MAINTENANCE:'Održavanje',RETIRED:'Penzionisano'}
export function ResourcesPage() {
  const navigate=useNavigate(),actor=useAuthStore(state=>state.user),manage=hasCapability(actor,'RESOURCE_MANAGE')
  const [params,setParams]=useSearchParams()
  const chosenLocation=params.get('locationId')??'',chosenArea=params.get('areaId')??''
  const setLocation=(id:string)=>setParams(current=>{current.set('locationId',id);current.delete('areaId');current.delete('resourceId');return current})
  const setArea=(id:string)=>setParams(current=>{if(id)current.set('areaId',id);else current.delete('areaId');current.delete('resourceId');return current})
  const [start,setStart]=useState(()=>businessInstantToLocal(new Date(Date.now()+3600000).toISOString()))
  const [editor,setEditor]=useState<{kind:ResourceEditorKind;initial?:LocationView|AreaView|ResourceView}|null>(null)
  const [showEmployees,setShowEmployees]=useState(false)
  const locations=useQuery({queryKey:['resources','locations'],queryFn:resourceApi.locations})
  const visibleLocations=locations.data?.filter(value=>manage||value.active)??[]
  const locationId=visibleLocations.some(value=>value.id===chosenLocation)?chosenLocation:visibleLocations[0]?.id??''
  const areas=useQuery({queryKey:['resources','areas',locationId],queryFn:()=>resourceApi.areas(locationId),enabled:!!locationId})
  const visibleAreas=areas.data?.filter(value=>manage||value.active)??[]
  const areaId=visibleAreas.some(value=>value.id===chosenArea)?chosenArea:visibleAreas[0]?.id??''
  const area=visibleAreas.find(value=>value.id===areaId),location=visibleLocations.find(value=>value.id===locationId)
  const resources=useQuery({queryKey:['resources','availability',areaId,start],queryFn:()=>{
    const from=businessLocalToInstant(start),to=new Date(Date.parse(from)+3600000).toISOString()
    return resourceApi.availability(areaId,from,to)
  },enabled:!!areaId&&!!start})
  const editable=useQuery({queryKey:['resources','list',areaId],queryFn:()=>resourceApi.resources(areaId),enabled:manage&&!!areaId})
  function openResource(value:ResourceAvailability) {
    if(actor?.role==='CUSTOMER')navigate(`/my-reservations?serviceId=${value.serviceId}&resourceId=${value.id}`)
    else navigate(value.type==='GAMING_PC'?`/gaming-sessions?stationId=${value.id}`:`/calendar?resourceId=${value.id}`)
  }
  return <main className="workspace">
    <PageHeader eyebrow="Prostor i kapacitet" title="Mapa resursa" actions={manage&&<Button onClick={()=>setEditor({kind:'LOCATION'})}>Nova lokacija</Button>}/>
    <p className="search-help">Izaberite lokaciju, zonu i početak. Dostupnost se prikazuje za narednih 60 minuta u zoni Europe/Belgrade.</p>
    {locations.isLoading?<Skeleton lines={5} label="Učitavanje lokacija"/>:locations.error?<ErrorState message={apiErrorMessage(locations.error,'Lokacije nisu dostupne.')} action={<Button onClick={()=>locations.refetch()}>Pokušaj ponovo</Button>}/>:!visibleLocations.length?<EmptyState title="Nema dostupnih lokacija" description="Dodajte aktivnu lokaciju, zatim zone i resurse." action={manage&&<Button onClick={()=>setEditor({kind:'LOCATION'})}>Dodaj prvu lokaciju</Button>}/>:<>
      <section className="panel resource-controls"><div className="editor-columns"><label>Lokacija<select value={locationId} onChange={event=>{setLocation(event.target.value)}}>{visibleLocations.map(value=><option key={value.id} value={value.id}>{value.name}{!value.active?' · neaktivna':''}</option>)}</select></label>
        <label>Zona<select value={areaId} disabled={!visibleAreas.length} onChange={e=>setArea(e.target.value)}>{visibleAreas.map(value=><option key={value.id} value={value.id}>{value.name}{!value.active?' · neaktivna':''}</option>)}</select></label>
        <label>Početak<input type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></label></div>
        {manage&&<div className="form-actions"><Button variant="secondary" onClick={()=>setEditor({kind:'LOCATION',initial:location})}>Izmeni lokaciju</Button><Button variant="secondary" onClick={()=>setShowEmployees(true)}>Zaposleni na lokaciji</Button><Button onClick={()=>setEditor({kind:'AREA'})}>Nova zona</Button>
          {area&&<><Button variant="secondary" onClick={()=>setEditor({kind:'AREA',initial:area})}>Izmeni zonu</Button><Button onClick={()=>setEditor({kind:'RESOURCE'})}>Novi resurs</Button></>}</div>}
      </section>
      {areas.isLoading?<Skeleton lines={3} label="Učitavanje zona"/>:areas.error?<ErrorState message="Zone nisu dostupne." action={<Button onClick={()=>areas.refetch()}>Pokušaj ponovo</Button>}/>:!visibleAreas.length?<EmptyState title="Lokacija nema aktivne zone" description="Dodajte zonu ili izaberite drugu lokaciju." action={manage&&<Button onClick={()=>setEditor({kind:'AREA'})}>Dodaj zonu</Button>}/>:resources.isLoading?<Skeleton lines={3} label="Osvežavanje mape"/>:resources.error?<ErrorState message={apiErrorMessage(resources.error,'Mapa nije dostupna.')} action={<Button onClick={()=>resources.refetch()}>Pokušaj ponovo</Button>}/>:!resources.data?.length?<EmptyState title="Zona nema resurse" action={manage&&<Button onClick={()=>setEditor({kind:'RESOURCE'})}>Dodaj prvi resurs</Button>}/>:area&&<>
        <section className="panel resource-map-panel"><h2>{area.name}</h2><div className="resource-map" aria-label={`Mapa zone ${area.name}`} style={{aspectRatio:`${area.mapWidth}/${area.mapHeight}`}}>
          {resources.data.map(value=><button key={value.id} className={`resource-map-item resource-${value.status.toLowerCase()}`} disabled={actor?.role==='CUSTOMER'&&!['AVAILABLE','OCCUPIED'].includes(value.status)} onClick={()=>openResource(value)}
            aria-label={`${value.name}: ${labels[value.status]}`} style={{left:`${value.x/area.mapWidth*100}%`,top:`${value.y/area.mapHeight*100}%`,width:`${value.width/area.mapWidth*100}%`,height:`${value.height/area.mapHeight*100}%`,transform:`rotate(${value.rotation}deg)`}}><strong>{value.name}</strong><small>{labels[value.status]}</small></button>)}
        </div><p className="search-help">Slobodno · zauzeto · održavanje · van funkcije. Dostupnost se ponovo proverava pri potvrdi termina.</p></section>
        <section className="panel-grid resource-list" aria-label="Resursi u zoni">{resources.data.map(value=><article className={`panel${params.get('resourceId')===value.id?' selected-resource':''}`} key={value.id}><div className="section-heading"><h2>{value.name}</h2><Badge tone={value.status==='AVAILABLE'?'success':value.status==='OCCUPIED'?'warning':'neutral'}>{labels[value.status]}</Badge></div><small>{value.code} · {value.type}</small>
          <div className="form-actions"><Button variant="secondary" disabled={actor?.role==='CUSTOMER'&&!['AVAILABLE','OCCUPIED'].includes(value.status)} onClick={()=>openResource(value)}>{actor?.role==='CUSTOMER'?'Izaberi termin':'Otvori operativu'}</Button>
            {manage&&<Button variant="secondary" disabled={!editable.data?.some(v=>v.id===value.id)} onClick={()=>setEditor({kind:'RESOURCE',initial:editable.data?.find(v=>v.id===value.id)})}>Podesi resurs</Button>}</div></article>)}</section>
      </>}
    </>}
    {editor&&<ResourceEditor {...editor} locationId={locationId} areaId={areaId} onClose={()=>setEditor(null)} onSaved={id=>{if(editor.kind==='LOCATION')setLocation(id);else if(editor.kind==='AREA')setArea(id)}}/>}
    {showEmployees&&location&&<LocationEmployees locationId={location.id} locationName={location.name} onClose={()=>setShowEmployees(false)}/>}
  </main>
}
