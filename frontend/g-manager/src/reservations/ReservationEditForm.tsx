import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { reservationApi } from '../api/reservationApi'
import { apiErrorMessage } from '../api/client'
import { Button, ErrorState, Skeleton } from '../components/ui'
import { businessInstantToLocal, businessLocalToInstant, formatBusinessDateTime } from './dateTime'
import type { ReservationDetail } from '../types/reservation.types'
export function ReservationEditForm({value,onChanged,onClose,onBusyChange}:{value:ReservationDetail;onChanged:()=>Promise<void>;onClose:()=>void;onBusyChange?:(busy:boolean)=>void}) {
  const [start,setStart]=useState(()=>businessInstantToLocal(value.startTime))
  const [resourceId,setResourceId]=useState(value.resourceId??'')
  const [note,setNote]=useState(value.note??'')
  let instant=''
  try{instant=businessLocalToInstant(start)}catch{/* incomplete input */}
  const options=useQuery({queryKey:['reservation-edit-options',value.id,value.version,instant],
    queryFn:()=>reservationApi.resourceOptions(value.id,instant),enabled:!!instant,refetchInterval:15000,retry:false})
  const resource=options.data?.resources.find(r=>r.id===resourceId&&r.available)
  const maySave=!!instant&&Date.parse(instant)>Date.now()&&!options.isFetching&&!options.error
    &&(!resourceId||!!resource)&&(!value.resourceRequired||!!resourceId)
  const save=useMutation({mutationFn:()=>reservationApi.update(value.id,{version:value.version,startTime:instant,
    resourceId:resourceId||undefined,note}),onSuccess:async()=>{await onChanged();onClose()},
    onError:async()=>{await onChanged();await options.refetch()}})
  useEffect(()=>{onBusyChange?.(save.isPending)},[save.isPending,onBusyChange])
  useEffect(()=>()=>onBusyChange?.(false),[onBusyChange])
  return <form className="form-grid reservation-editor panel" onSubmit={e=>{e.preventDefault();if(maySave&&!save.isPending)save.mutate()}}>
    <h3>Izmena vremena i stanice</h3><p className="search-help">Premeštanje zahteva ovlašćenje i za izvornu i za ciljnu stanicu. Usluga, klijent i trajanje ostaju vezani za ovaj termin.</p>
    <label>Datum i vreme (Europe/Belgrade)<input required type="datetime-local" disabled={save.isPending} value={start} onChange={e=>setStart(e.target.value)}/></label>
    {options.isLoading?<Skeleton lines={2}/>:options.error?<ErrorState message={apiErrorMessage(options.error,'Slobodne stanice nisu dostupne.')} action={<Button type="button" onClick={()=>options.refetch()}>Pokušaj ponovo</Button>}/>:<label>Računar / resurs<select required={!!value.resourceRequired} disabled={save.isPending} value={resourceId} onChange={e=>setResourceId(e.target.value)}>
      {!value.resourceId&&<option value="">{value.resourceRequired?'Izaberite stanicu':'Bez fizičkog resursa'}</option>}
      {resourceId&&!options.data?.resources.some(r=>r.id===resourceId)&&<option value={resourceId} disabled>Trenutna stanica nije dostupna za ovaj termin</option>}
      {options.data?.resources.map(r=><option key={r.id} value={r.id} disabled={!r.available}>{r.code} · {r.name} · {r.locationName}{r.available?'':' — Zauzet ili van radnog vremena'}</option>)}
    </select></label>}
    <label>Napomena<textarea maxLength={500} disabled={save.isPending} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <p>{resource?`${resource.locationName} · ${resource.code} · ${resource.name}`:value.locationName} · {instant&&formatBusinessDateTime(instant)}</p>
    {save.error&&<p role="alert" className="error-banner">{apiErrorMessage(save.error,'Izmene nije moguće sačuvati.')}</p>}
    <div className="form-actions"><Button type="submit" disabled={!maySave} loading={save.isPending}>Sačuvaj izmene</Button><Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>Odustani</Button></div>
  </form>
}
