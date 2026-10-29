import { LocationFields, AreaGeometryFields, ResourceGeometryFields } from './ResourceEditorFields'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { resourceApi } from '../api/resourceApi'
import { catalogApi } from '../api/catalogApi'
import { apiErrorMessage } from '../api/client'
import { Button, Modal, Input, Select, Textarea, Alert } from '../components/ui'
import type { LocationView, AreaView, ResourceView, ResourceType } from '../types/resource.types'
import './resources.css'

export type ResourceEditorKind='LOCATION'|'AREA'|'RESOURCE'
export function ResourceEditor({kind,initial,locationId='',areaId='',onClose,onSaved}:{kind:ResourceEditorKind;initial?:LocationView|AreaView|ResourceView;locationId?:string;areaId?:string;onClose:()=>void;onSaved:(id:string)=>void}) {
  const client=useQueryClient(),inFlight=useRef(false)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const [code,setCode]=useState(initial?.code??''),[name,setName]=useState(initial?.name??''),[description,setDescription]=useState(initial?.description??''),[active,setActive]=useState(initial?.active??true)
  const [address,setAddress]=useState(initial&&'address' in initial?initial.address:''),[timezone,setTimezone]=useState(initial&&'timezone' in initial?initial.timezone:'Europe/Belgrade')
  const [mapWidth,setMapWidth]=useState(initial&&'mapWidth' in initial?initial.mapWidth:1000),[mapHeight,setMapHeight]=useState(initial&&'mapHeight' in initial?initial.mapHeight:700)
  const [serviceId,setServiceId]=useState(initial&&'serviceId' in initial?initial.serviceId:''),[type,setType]=useState<ResourceType>(initial&&'type' in initial?initial.type:'GAMING_PC')
  const [bookable,setBookable]=useState(initial&&'bookable' in initial?initial.bookable:true),[capacity,setCapacity]=useState(initial&&'capacity' in initial?initial.capacity:1)
  const [x,setX]=useState(initial&&'x' in initial?initial.x:20),[y,setY]=useState(initial&&'y' in initial?initial.y:20)
  const [width,setWidth]=useState(initial&&'width' in initial?initial.width:140),[height,setHeight]=useState(initial&&'height' in initial?initial.height:90)
  const [rotation,setRotation]=useState(initial&&'rotation' in initial?initial.rotation:0),[displayOrder,setDisplayOrder]=useState(initial&&'displayOrder' in initial?initial.displayOrder:0)
  const catalog=useQuery({queryKey:['resources','service-options'],queryFn:()=>catalogApi.list({page:0,size:100,type:'SERVICE',active:true,sort:'name',direction:'ASC'}),enabled:kind==='RESOURCE'})
  const { confirm, confirmationDialog } = useConfirmDialog()
  const dirty = code !== (initial?.code ?? '') || name !== (initial?.name ?? '') || description !== (initial?.description ?? '') || active !== (initial?.active ?? true)
    || serviceId !== (initial && 'serviceId' in initial ? initial.serviceId : '') || type !== (initial && 'type' in initial ? initial.type : 'GAMING_PC')
    || address !== (initial && 'address' in initial ? initial.address : '') || timezone !== (initial && 'timezone' in initial ? initial.timezone : 'Europe/Belgrade')
    || mapWidth !== (initial && 'mapWidth' in initial ? initial.mapWidth : 1000) || mapHeight !== (initial && 'mapHeight' in initial ? initial.mapHeight : 700)
    || bookable !== (initial && 'bookable' in initial ? initial.bookable : true) || capacity !== (initial && 'capacity' in initial ? initial.capacity : 1)
    || x !== (initial && 'x' in initial ? initial.x : 20) || y !== (initial && 'y' in initial ? initial.y : 20)
    || width !== (initial && 'width' in initial ? initial.width : 140) || height !== (initial && 'height' in initial ? initial.height : 90)
    || rotation !== (initial && 'rotation' in initial ? initial.rotation : 0) || displayOrder !== (initial && 'displayOrder' in initial ? initial.displayOrder : 0)
  const releaseNavigation = useDirtyGuard(dirty || busy, { pending: busy })
  const close = () => { if (busy) return; if (!dirty) onClose(); else confirm({ title: 'Odbaci izmene?', description: 'Podaci o prostoru nisu sačuvani.', confirmLabel: 'Odbaci izmene', variant: 'warning', onConfirm: onClose }) }
  async function save(event:FormEvent) {
    event.preventDefault();if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('')
    const base={code:code.trim(),name:name.trim(),description:description.trim(),active,version:initial?.version}
    try {
      const saved=kind==='LOCATION'?await resourceApi.saveLocation({...base,address:address.trim(),timezone},initial?.id):kind==='AREA'?await resourceApi.saveArea(locationId,{...base,mapWidth,mapHeight,displayOrder},initial?.id):await resourceApi.saveResource(areaId,{...base,serviceId,type,bookable,capacity,x,y,width,height,rotation,displayOrder},initial?.id)
      void client.invalidateQueries({queryKey:['resources']});void client.invalidateQueries({queryKey:['setup']});void client.invalidateQueries({queryKey:['stations']});void client.invalidateQueries({queryKey:['gaming-operations']})
      releaseNavigation(); onSaved(saved.id);onClose()
    } catch(cause){setError(apiErrorMessage(cause,'Podešavanje nije moguće sačuvati.'))}
    finally{inFlight.current=false;setBusy(false)}
  }
  return <>{confirmationDialog}<Modal size="wide" open className="resource-editor-dialog" closeDisabled={busy} title={`${initial?'Izmeni':'Dodaj'} ${kind==='LOCATION'?'lokaciju':kind==='AREA'?'zonu':'resurs'}`} onClose={close}><form className="ui-form-grid form-grid resource-editor-form" onSubmit={save}>
    {error&&<Alert tone="danger" role="alert">{error}</Alert>}
    <label>Naziv<Input aria-label={"Naziv"} required maxLength={120} disabled={busy} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>Šifra<Input aria-label={"Šifra"} required maxLength={40} disabled={busy} value={code} onChange={e=>setCode(e.target.value)}/></label>
    {kind==='LOCATION'&&<LocationFields address={address} timezone={timezone} onAddress={setAddress} onTimezone={setTimezone} busy={busy}/>}
    {kind==='AREA'&&<AreaGeometryFields width={mapWidth} height={mapHeight} onWidth={setMapWidth} onHeight={setMapHeight} busy={busy}/>}
    {kind==='RESOURCE'&&<><label>Usluga<Select aria-label={"Usluga"} required value={serviceId} disabled={busy||catalog.isLoading} onChange={e=>setServiceId(e.target.value)}><option value="">Izaberite uslugu</option>{catalog.data?.content.map(service=><option key={service.id} value={service.id}>{service.name}</option>)}</Select></label>
      {catalog.error&&<p role="alert">Usluge nisu dostupne. <Button variant="secondary" type="button" onClick={()=>catalog.refetch()}>Pokušaj ponovo</Button></p>}
      {catalog.data&&!catalog.data.content.length&&<p>Prvo dodajte aktivnu uslugu u katalogu.</p>}
      <label>Tip<Select aria-label={"Tip"} value={type} disabled={busy} onChange={e=>setType(e.target.value as ResourceType)}>{Object.entries({ GAMING_PC:'Gaming računar', PLAYSTATION:'PlayStation', SIMULATOR:'Simulator', VIP_ROOM:'VIP soba', OTHER:'Drugo' }).map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></label>
      <label>Kapacitet<Input aria-label={"Kapacitet"} required type="number" min={1} value={capacity} disabled={busy} onChange={e=>setCapacity(Number(e.target.value))}/></label>
      <ResourceGeometryFields value={{x,y,width,height,rotation}} busy={busy} onChange={patch=>{if(patch.x!==undefined)setX(patch.x);if(patch.y!==undefined)setY(patch.y);if(patch.width!==undefined)setWidth(patch.width);if(patch.height!==undefined)setHeight(patch.height);if(patch.rotation!==undefined)setRotation(patch.rotation)}}/>
      <label className="inline-toggle"><Input aria-label={"Dozvoljeno zakazivanje"} type="checkbox" checked={bookable} disabled={busy} onChange={e=>setBookable(e.target.checked)}/> Dozvoljeno zakazivanje</label></>}
    {kind!=='LOCATION'&&<label>Redosled prikaza<Input aria-label={"Redosled prikaza"} type="number" required value={displayOrder} disabled={busy} onChange={e=>setDisplayOrder(Number(e.target.value))}/></label>}
    <label>Opis<Textarea aria-label={"Opis"} maxLength={500} value={description} disabled={busy} onChange={e=>setDescription(e.target.value)}/></label><label className="inline-toggle"><Input aria-label={"Aktivan"} type="checkbox" checked={active} disabled={busy} onChange={e=>setActive(e.target.checked)}/> Aktivan</label>
    {kind==='RESOURCE'&&type==='GAMING_PC'&&!initial&&<p>Nakon dodavanja otvorite PC konfiguraciju: dodelite profil aplikacija, povežite Client i proverite spremnost. Dodele zaposlenih podešavaju se za konkretan resurs.</p>}
    <Button type="submit" loading={busy} disabled={kind==='RESOURCE'&&!serviceId}>Sačuvaj</Button>
  </form></Modal></>
}
