import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { resourceApi } from '../api/resourceApi'
import { catalogApi } from '../api/catalogApi'
import { apiErrorMessage } from '../api/client'
import { Button, Modal } from '../components/ui'
import type { LocationView, AreaView, ResourceView, ResourceType } from '../types/resource.types'

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
  async function save(event:FormEvent) {
    event.preventDefault();if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('')
    const base={code:code.trim(),name:name.trim(),description:description.trim(),active,version:initial?.version}
    try {
      const saved=kind==='LOCATION'?await resourceApi.saveLocation({...base,address:address.trim(),timezone},initial?.id):kind==='AREA'?await resourceApi.saveArea(locationId,{...base,mapWidth,mapHeight,displayOrder},initial?.id):await resourceApi.saveResource(areaId,{...base,serviceId,type,bookable,capacity,x,y,width,height,rotation,displayOrder},initial?.id)
      void client.invalidateQueries({queryKey:['resources']});void client.invalidateQueries({queryKey:['setup']});void client.invalidateQueries({queryKey:['stations']});void client.invalidateQueries({queryKey:['gaming-operations']})
      onSaved(saved.id);onClose()
    } catch(cause){setError(apiErrorMessage(cause,'Podešavanje nije moguće sačuvati.'))}
    finally{inFlight.current=false;setBusy(false)}
  }
  return <Modal open closeDisabled={busy} title={`${initial?'Izmeni':'Dodaj'} ${kind==='LOCATION'?'lokaciju':kind==='AREA'?'zonu':'resurs'}`} onClose={()=>{if(!busy)onClose()}}><form className="form-grid" onSubmit={save}>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    <label>Naziv<input required maxLength={120} disabled={busy} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>Šifra<input required maxLength={40} disabled={busy} value={code} onChange={e=>setCode(e.target.value)}/></label>
    {kind==='LOCATION'&&<><label>Adresa<input required maxLength={255} value={address} disabled={busy} onChange={e=>setAddress(e.target.value)}/></label><label>Vremenska zona<input required maxLength={60} value={timezone} disabled={busy} onChange={e=>setTimezone(e.target.value)}/></label></>}
    {kind==='AREA'&&<div className="editor-columns"><label>Širina mape<input required type="number" min={1} disabled={busy} value={mapWidth} onChange={e=>setMapWidth(Number(e.target.value))}/></label><label>Visina mape<input required type="number" min={1} disabled={busy} value={mapHeight} onChange={e=>setMapHeight(Number(e.target.value))}/></label></div>}
    {kind==='RESOURCE'&&<><label>Usluga<select required value={serviceId} disabled={busy||catalog.isLoading} onChange={e=>setServiceId(e.target.value)}><option value="">Izaberite uslugu</option>{catalog.data?.content.map(service=><option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
      {catalog.error&&<p role="alert">Usluge nisu dostupne. <Button type="button" onClick={()=>catalog.refetch()}>Pokušaj ponovo</Button></p>}
      {catalog.data&&!catalog.data.content.length&&<p>Prvo dodajte aktivnu uslugu u katalogu.</p>}
      <label>Tip<select value={type} disabled={busy} onChange={e=>setType(e.target.value as ResourceType)}>{['GAMING_PC','PLAYSTATION','SIMULATOR','VIP_ROOM','OTHER'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Kapacitet<input required type="number" min={1} value={capacity} disabled={busy} onChange={e=>setCapacity(Number(e.target.value))}/></label>
      <fieldset><legend>Pozicija na mapi</legend><div className="editor-columns"><label>X<input required type="number" min={0} value={x} disabled={busy} onChange={e=>setX(Number(e.target.value))}/></label><label>Y<input required type="number" min={0} value={y} disabled={busy} onChange={e=>setY(Number(e.target.value))}/></label>
        <label>Širina<input required type="number" min={1} value={width} disabled={busy} onChange={e=>setWidth(Number(e.target.value))}/></label><label>Visina<input required type="number" min={1} value={height} disabled={busy} onChange={e=>setHeight(Number(e.target.value))}/></label><label>Rotacija<input required type="number" value={rotation} disabled={busy} onChange={e=>setRotation(Number(e.target.value))}/></label></div></fieldset>
      <label className="inline-toggle"><input type="checkbox" checked={bookable} disabled={busy} onChange={e=>setBookable(e.target.checked)}/> Dozvoljeno zakazivanje</label></>}
    {kind!=='LOCATION'&&<label>Redosled prikaza<input type="number" required value={displayOrder} disabled={busy} onChange={e=>setDisplayOrder(Number(e.target.value))}/></label>}
    <label>Opis<textarea maxLength={500} value={description} disabled={busy} onChange={e=>setDescription(e.target.value)}/></label><label className="inline-toggle"><input type="checkbox" checked={active} disabled={busy} onChange={e=>setActive(e.target.checked)}/> Aktivan</label>
    <Button type="submit" loading={busy} disabled={kind==='RESOURCE'&&!serviceId}>Sačuvaj</Button>
  </form></Modal>
}
