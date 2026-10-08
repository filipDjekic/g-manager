import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { catalogApi } from '../api/catalogApi'
import { resourceApi } from '../api/resourceApi'
import { reservationApi } from '../api/reservationApi'
import { userApi } from '../api/userApi'
import { IdempotencyKeyManager } from '../api/idempotency'
import { useAuthStore } from '../auth/authStore'
import { Button, EmptyState, ErrorState, Modal, Skeleton } from '../components/ui'
import { CustomerPicker } from './CustomerPicker'
import { RecurrencePreviewPanel, RecurrenceResultPanel } from './RecurrencePreviewPanel'
import { businessInstantToLocal, businessLocalToInstant, formatBusinessDateTime } from './dateTime'
import type { RecurrenceInput, RecurrenceFrequency, RecurrenceConflictPolicy, RecurrenceCreateResult, ReservationCreationRequest } from '../types/reservation.types'

type StaffReservationResult = {
  id: string
  summary: string
  recurrence: RecurrenceCreateResult | undefined
}

export function StaffReservationForm({onClose,onCreated}:{onClose:()=>void;onCreated:(id:string,summary?:string)=>void}) {
  const actor=useAuthStore(s=>s.user),client=useQueryClient()
  const [customerName,setCustomerName]=useState('')
  const [customerId,setCustomerId]=useState(''),[serviceId,setServiceId]=useState(''),[serviceSearch,setServiceSearch]=useState('')
  const [employeeId,setEmployeeId]=useState(actor?.role==='EMPLOYEE'?actor.id:'')
  const [resourceId,setResourceId]=useState(''),[locationId,setLocationId]=useState('')
  const [localStart,setLocalStart]=useState(()=>businessInstantToLocal(new Date(Date.now()+3600000).toISOString()))
  const [note,setNote]=useState(''),[review,setReview]=useState(false)
  const [repeat,setRepeat]=useState(false),[frequency,setFrequency]=useState<RecurrenceFrequency>('WEEKLY')
  const [interval,setInterval]=useState(1),[occurrences,setOccurrences]=useState(4)
  const [seriesResult,setSeriesResult]=useState<RecurrenceCreateResult|null>(null)
  const [conflictPolicy,setConflictPolicy]=useState<RecurrenceConflictPolicy>('ALL_OR_NOTHING')
  const keys=useRef(new IdempotencyKeyManager()),pending=useRef<ReservationCreationRequest|null>(null)
  const services=useQuery({queryKey:['catalog','reservation-services',serviceSearch],queryFn:()=>catalogApi.list({page:0,size:100,type:'SERVICE',active:true,search:serviceSearch||undefined})})
  const employees=useQuery({queryKey:['users','reservation-employees'],queryFn:userApi.employees})
  const locations=useQuery({queryKey:['resources','locations'],queryFn:resourceApi.locations})
  const scope=useQuery({queryKey:['resource-management-scope'],queryFn:resourceApi.managementScope,refetchInterval:15000})
  const service=services.data?.content.find(s=>s.id===serviceId)
  let start='',end=''
  try { if(localStart&&service?.durationMinutes) {start=businessLocalToInstant(localStart);end=new Date(Date.parse(start)+service.durationMinutes*60000).toISOString()} } catch { /* input is still being entered */ }
  const options=useQuery({queryKey:['staff-booking-options',actor?.id,serviceId,locationId,start,end],
    queryFn:()=>resourceApi.bookingOptions({serviceId,locationId:locationId||undefined,start,end,managedOnly:true}),enabled:!!serviceId&&!!start&&!!end,refetchInterval:15000})
  const compatible=options.data?.resources??[]
  const selected=resourceId?compatible.find(r=>r.id===resourceId&&(repeat||r.available)):compatible.find(r=>repeat||r.available)
  const needsResource=options.data?.resourceRequired||actor?.role==='EMPLOYEE'
  const recurrenceInput:RecurrenceInput={customerId,serviceId,employeeId,resourceId:selected?.id,locationId:selected?.locationId??(locationId||undefined),
    startTime:start,note:note||undefined,frequency,interval,occurrences,conflictPolicy}
  const preview=useQuery({queryKey:['staff-recurrence-preview',JSON.stringify(recurrenceInput)],queryFn:()=>reservationApi.previewRecurrence(recurrenceInput),
    enabled:repeat&&!!employeeId&&!!customerId&&!!service&&!!start&&!!options.data&&(!needsResource||!!selected),retry:false,refetchInterval:15000})
  const frozen=!!keys.current.pendingKey()
  const create=useMutation<StaffReservationResult, Error, void>({mutationFn:()=>{
    const request:ReservationCreationRequest=pending.current??(repeat
      ? {kind:'RECURRING',input:recurrenceInput}
      : {kind:'SINGLE',input:{customerId,serviceId,employeeId:employeeId||undefined,
        resourceId:selected?.id,locationId:selected?.locationId??(locationId||undefined),startTime:start,note:note||undefined}})
    pending.current=request
    if(request.kind==='RECURRING')return reservationApi.createRecurrence(request.input,keys.current.begin()).then(result=>({id:result.created[0].id,summary:`Kreirano ${result.created.length}, preskočeno ${result.skipped.length} termina.`,recurrence:result}))
    return reservationApi.create(request.input,keys.current.begin()).then(value=>({id:value.id,summary:'Rezervacija je kreirana.',recurrence:undefined}))
  },onSuccess:async value=>{keys.current.succeeded();pending.current=null;await client.invalidateQueries({queryKey:['reservations']});if(value.recurrence)setSeriesResult(value.recurrence);else onCreated(value.id,value.summary)},
    onError:async error=>{keys.current.failed(error);if(!keys.current.pendingKey())pending.current=null;await Promise.all([options.refetch(),scope.refetch()])}})
  const eligible=!!customerId&&!!service&&!!start&&Date.parse(start)>Date.now()&&!options.isFetching&&!options.error
    &&(!!selected||!needsResource)&&(!resourceId||!!selected)&&(!scope.error)&&(!scope.isLoading)
    &&(scope.data?.allResources||!!selected&&scope.data?.resourceIds.includes(selected.id))
    &&(!repeat||!!employeeId&&!preview.isFetching&&!preview.error&&!!preview.data
      &&(conflictPolicy==='ALL_OR_NOTHING'?preview.data.occurrences.every(o=>o.available):preview.data.occurrences.some(o=>o.available)))
  const blocked=create.isPending||frozen
  return <Modal open title="Nova rezervacija" onClose={()=>{if(!create.isPending&&!frozen)onClose()}}>
    {seriesResult ? <><RecurrenceResultPanel result={seriesResult} /><div className="form-actions"><Button onClick={()=>onCreated(seriesResult.created[0].id,`Kreirano ${seriesResult.created.length}, preskočeno ${seriesResult.skipped.length} termina.`)}>Otvori kreiranu rezervaciju</Button><Button variant="secondary" onClick={onClose}>Zatvori</Button></div></> : <>
    {create.error&&<ErrorState message={apiErrorMessage(create.error,'Rezervaciju nije moguće kreirati.')}/>}
    {scope.error&&<ErrorState message="Dodele stanica nisu dostupne." action={<Button onClick={()=>scope.refetch()}>Pokušaj ponovo</Button>}/>}
    {!scope.isLoading&&!scope.error&&!scope.data?.allResources&&!scope.data?.resourceIds.length&&<EmptyState title="Nemate dodeljene stanice" description="Administrator treba da vam dodeli stanicu pre kreiranja rezervacije."/>}
    <form className="form-grid reservation-editor" onSubmit={e=>{e.preventDefault();if(eligible||frozen){if(review)create.mutate();else {if(selected)setResourceId(selected.id);setReview(true)}}}}>
      {!review?<>
        <CustomerPicker value={customerId} required disabled={blocked} onChange={(id,name)=>{setCustomerId(id);setCustomerName(name??'Izabrani klijent')}}/>
        <label>Pretraga usluge<input disabled={blocked} value={serviceSearch} onChange={e=>setServiceSearch(e.target.value)}/></label>
        <label>Usluga<select required disabled={blocked||services.isLoading} value={serviceId} onChange={e=>{setServiceId(e.target.value);setResourceId('')}}><option value="">Izaberite uslugu</option>{services.data?.content.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {services.error&&<ErrorState message="Usluge nisu dostupne." action={<Button type="button" onClick={()=>services.refetch()}>Pokušaj ponovo</Button>}/>}
        <label>Zaposleni<select disabled={blocked||employees.isLoading} value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">Automatski slobodan zaposleni</option>{employees.data?.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        {employees.error&&<ErrorState message="Zaposleni nisu dostupni." action={<Button type="button" onClick={()=>employees.refetch()}>Pokušaj ponovo</Button>}/>}
        <label>Lokacija<select disabled={blocked||locations.isLoading} value={locationId} onChange={e=>{setLocationId(e.target.value);setResourceId('')}}><option value="">Sve lokacije</option>{locations.data?.filter(l=>l.active).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        {locations.error&&<ErrorState message="Lokacije nisu dostupne." action={<Button type="button" onClick={()=>locations.refetch()}>Pokušaj ponovo</Button>}/>}
        <label>Datum i vreme (Europe/Belgrade)<input type="datetime-local" required disabled={blocked} value={localStart} onChange={e=>setLocalStart(e.target.value)}/></label>
        {options.isLoading?<Skeleton lines={2}/>:options.error?<ErrorState message={apiErrorMessage(options.error,'Stanice nisu dostupne.')} action={<Button type="button" onClick={()=>options.refetch()}>Pokušaj ponovo</Button>}/>:<label>Računar / resurs<select disabled={blocked||!service} value={resourceId} onChange={e=>setResourceId(e.target.value)}><option value="">{needsResource?'Automatski dodeli slobodan resurs':'Bez fizičkog resursa'}</option>{compatible.map(r=><option key={r.id} value={r.id} disabled={!repeat&&!r.available}>{r.code} · {r.name} · {r.locationName}{r.available?'':' — Zauzet'}</option>)}</select></label>}
        {service&&needsResource&&!options.isLoading&&!options.error&&!selected&&<p className="warning-banner">Nema slobodnog kompatibilnog resursa u izabranom opsegu.</p>}
        <label className="checkbox-field"><input type="checkbox" disabled={blocked} checked={repeat} onChange={e=>setRepeat(e.target.checked)}/> Ponavljajuća rezervacija</label>
        {repeat&&<><p className="search-help">Izaberite zaposlenog i isti resurs za sve termine serije.</p>
          <label>Učestalost<select disabled={blocked} value={frequency} onChange={e=>setFrequency(e.target.value as RecurrenceFrequency)}><option value="WEEKLY">Nedeljno</option><option value="MONTHLY">Mesečno</option></select></label>
          <label>Interval<input type="number" min={1} max={4} required disabled={blocked} value={interval} onChange={e=>setInterval(Number(e.target.value))}/></label>
          <label>Broj termina<input type="number" min={2} max={20} required disabled={blocked} value={occurrences} onChange={e=>setOccurrences(Number(e.target.value))}/></label>
          <label>Konflikti<select disabled={blocked} value={conflictPolicy} onChange={e=>setConflictPolicy(e.target.value as RecurrenceConflictPolicy)}><option value="ALL_OR_NOTHING">Kreiraj samo ako su svi termini slobodni</option><option value="SKIP_CONFLICTS">Preskoči zauzete termine</option></select></label></>}
        <label>Napomena<textarea maxLength={500} disabled={blocked} value={note} onChange={e=>setNote(e.target.value)}/></label>
      </>:<section className="panel reservation-review"><h3>Pregled pre kreiranja</h3>
        <p><strong>Klijent:</strong> {customerName}</p><p><strong>Usluga:</strong> {service?.name}</p>
        <p><strong>Lokacija:</strong> {selected?.locationName??locations.data?.find(l=>l.id===locationId)?.name??'Bez lokacije'}</p><p><strong>Računar / resurs:</strong> {selected?`${selected.code} · ${selected.name}`:'Bez fizičkog resursa'}</p>
        <p><strong>Datum i vreme:</strong> {start&&formatBusinessDateTime(start)} — {end&&formatBusinessDateTime(end)}</p>
        {note&&<p>{note}</p>}{frozen&&<p role="status">Prethodni zahtev čeka konačan ishod. Ponovite isti zahtev.</p>}
      </section>}
      {repeat&&<section aria-label="Dostupnost ponavljajućih termina">
        {preview.isFetching?<Skeleton lines={3}/>:preview.error?<ErrorState message={apiErrorMessage(preview.error,'Pregled serije nije dostupan.')} action={<Button type="button" onClick={()=>preview.refetch()}>Pokušaj ponovo</Button>}/>:preview.data?<RecurrencePreviewPanel preview={preview.data} policy={conflictPolicy}/>:<p>Unesite klijenta, uslugu, zaposlenog i vreme za pregled serije.</p>}
      </section>}
      <div className="form-actions">{review&&!blocked&&<Button type="button" variant="secondary" onClick={()=>setReview(false)}>Izmeni podatke</Button>}
        <Button type="submit" loading={create.isPending} disabled={!eligible&&!frozen}>{review?'Kreiraj rezervaciju':'Pregled rezervacije'}</Button></div>
    </form></>}
  </Modal>
}
