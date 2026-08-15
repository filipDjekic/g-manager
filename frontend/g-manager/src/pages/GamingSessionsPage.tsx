import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { connectGamingSessionStream, gamingSessionApi } from '../api/gamingSessionApi'
import { customerApi } from '../api/customerApi'
import { apiErrorMessage } from '../api/client'
import { IdempotencyKeyManager } from '../api/idempotency'
import { Button, EmptyState, ErrorState, Modal, Skeleton } from '../components/ui'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { CustomerListItem } from '../types/customer.types'
import type { GamingStationCard } from '../types/gamingSession.types'

const statusLabel:Record<GamingStationCard['status'],string>={AVAILABLE:'Dostupna',ACTIVE:'Aktivna sesija',
  MAINTENANCE:'Održavanje',RETIRED:'Penzionisana',OFFLINE:'Offline',EXPIRED:'Sesija istekla',LOCK_PENDING:'Čeka zaključavanje'}
function remaining(value:number){const hours=Math.floor(value/3600);const minutes=Math.floor(value%3600/60);const seconds=value%60
  return `${hours?`${hours}h `:''}${minutes}m ${seconds.toString().padStart(2,'0')}s`}
function Countdown({station,serverTime}:{station:GamingStationCard;serverTime:string}){
  const [seconds,setSeconds]=useState(station.remainingSeconds)
  useEffect(()=>{setSeconds(station.remainingSeconds);const synchronizedAt=performance.now();const timer=window.setInterval(() =>
    setSeconds(Math.max(0,station.remainingSeconds-Math.floor((performance.now()-synchronizedAt)/1000))),1000)
    return()=>window.clearInterval(timer)},[station.sessionId,station.remainingSeconds,serverTime])
  return <strong className="gaming-countdown" aria-label={`Preostalo vreme ${remaining(seconds)}`}>{remaining(seconds)}</strong>
}

export function GamingSessionsPage(){
  const queryClient=useQueryClient();const board=useQuery({queryKey:['gaming-operations','board'],queryFn:()=>gamingSessionApi.board(),refetchInterval:30000})
  const [startStation,setStartStation]=useState<GamingStationCard|null>(null);const [search,setSearch]=useState('')
  const [customer,setCustomer]=useState<CustomerListItem|null>(null);const [duration,setDuration]=useState(120)
  const [customStation,setCustomStation]=useState<GamingStationCard|null>(null);const [customMinutes,setCustomMinutes]=useState(30)
  const [endStation,setEndStation]=useState<GamingStationCard|null>(null);const [reason,setReason]=useState('')
  const [error,setError]=useState('');const [busy,setBusy]=useState('')
  const startKey=useRef(new IdempotencyKeyManager());const actionKey=useRef(new IdempotencyKeyManager())
  const customers=useQuery({queryKey:['gaming-customer-search',search],queryFn:()=>customerApi.list({search:search||undefined,active:true,page:0,size:8}),enabled:startStation!==null})
  const refresh=()=>queryClient.invalidateQueries({queryKey:['gaming-operations']})
  useEffect(()=>connectGamingSessionStream(()=>{void refresh()}),[queryClient])

  function openStart(station:GamingStationCard){setStartStation(station);setSearch('');setCustomer(null);setDuration(120);setError('')}
  async function start(event:FormEvent){event.preventDefault();if(!startStation||!customer)return;setBusy('start');setError('')
    try{await gamingSessionApi.start({customerId:customer.id,resourceId:startStation.resourceId,durationMinutes:duration},startKey.current.begin())
      startKey.current.succeeded();setStartStation(null);await refresh()}
    catch(cause){startKey.current.failed(cause);setError(apiErrorMessage(cause,'Sesiju nije moguće pokrenuti.'));await refresh()}
    finally{setBusy('')}}
  async function extend(station:GamingStationCard,minutes:number){if(!station.sessionId||station.sessionVersion===undefined)return
    setBusy(`extend-${station.resourceId}`);setError('')
    try{await gamingSessionApi.extend(station.sessionId,minutes,station.sessionVersion,actionKey.current.begin());actionKey.current.succeeded();setCustomStation(null);await refresh()}
    catch(cause){actionKey.current.failed(cause);setError(apiErrorMessage(cause,'Sesiju nije moguće produžiti.'));await refresh()}
    finally{setBusy('')}}
  async function terminate(event:FormEvent){event.preventDefault();if(!endStation?.sessionId||endStation.sessionVersion===undefined||!reason.trim())return
    setBusy('terminate');setError('')
    try{await gamingSessionApi.terminate(endStation.sessionId,reason.trim(),endStation.sessionVersion,actionKey.current.begin());actionKey.current.succeeded();setEndStation(null);setReason('');await refresh()}
    catch(cause){actionKey.current.failed(cause);setError(apiErrorMessage(cause,'Sesiju nije moguće završiti.'));await refresh()}
    finally{setBusy('')}}

  return <main className="workspace gaming-operations"><div className="page-heading"><div><p className="eyebrow">Gaming operativa</p>
    <h1>Kontrola gaming stanica</h1><p>Stanja i vremena se automatski usklađuju sa serverom.</p></div>
    {board.data&&<time dateTime={board.data.serverTime}>Sinhronizovano: {formatBusinessDateTime(board.data.serverTime)}</time>}</div>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    {board.isLoading?<Skeleton lines={8} label="Učitavanje gaming stanica"/>:board.error?<ErrorState message={apiErrorMessage(board.error,'Gaming tabla nije dostupna.')} action={<Button onClick={()=>board.refetch()}>Pokušaj ponovo</Button>}/>:!board.data?.stations.length?
      <EmptyState title="Nema dostupnih stanica" description="Nijedna gaming stanica nije dodeljena vašim lokacijama."/>:
      <section className="gaming-station-grid" aria-label="Gaming stanice">{board.data.stations.map(station=><article key={station.resourceId}
        className={`gaming-station-card gaming-station-card--${station.status.toLowerCase().replace('_','-')}`}>
        <header><div><small>{station.resourceCode}</small><h2>{station.resourceName}</h2></div><span className="gaming-station-status">{statusLabel[station.status]}</span></header>
        {station.status==='ACTIVE'?<div className="gaming-session-summary"><p><span>Klijent</span><strong>{station.customerDisplayName??station.customerId}</strong></p>
          <p><span>Početak</span><time dateTime={station.startedAt}>{station.startedAt&&formatBusinessDateTime(station.startedAt)}</time></p>
          <p><span>Kraj</span><time dateTime={station.endsAt}>{station.endsAt&&formatBusinessDateTime(station.endsAt)}</time></p>
          <Countdown station={station} serverTime={board.data.serverTime}/></div>:
          <p className="gaming-station-message">{station.status==='AVAILABLE'?'Spremna za novu sesiju':station.status==='LOCK_PENDING'?'Sačekajte potvrdu lokalnog zaključavanja.':station.status==='EXPIRED'?'Prethodna sesija je istekla.':'Pokretanje sesije trenutno nije dozvoljeno.'}</p>}
        <footer className="form-actions">{station.allowedActions.includes('START')&&<Button onClick={()=>openStart(station)}>Pokreni sesiju</Button>}
          {station.allowedActions.includes('EXTEND')&&<><Button variant="secondary" loading={busy===`extend-${station.resourceId}`} onClick={()=>void extend(station,30)}>+30 min</Button>
            <Button variant="secondary" loading={busy===`extend-${station.resourceId}`} onClick={()=>void extend(station,60)}>+60 min</Button>
            <Button variant="secondary" onClick={()=>{setCustomStation(station);setCustomMinutes(30)}}>Drugo…</Button></>}
          {station.allowedActions.includes('TERMINATE')&&<Button variant="danger" onClick={()=>{setEndStation(station);setReason('')}}>Završi</Button>}</footer>
      </article>)}</section>}

    <Modal open={startStation!==null} title={`Pokreni sesiju · ${startStation?.resourceName??''}`} onClose={()=>setStartStation(null)}>
      <form className="form-grid" onSubmit={start}><label htmlFor="gaming-customer-search">Brza pretraga klijenta<input id="gaming-customer-search" autoFocus value={search} onChange={event=>{setSearch(event.target.value);setCustomer(null)}}/></label>
        <div className="gaming-customer-results" role="listbox" aria-label="Rezultati pretrage">{customers.isFetching&&<span role="status">Pretraga…</span>}
          {customers.data?.content.map(value=><button type="button" role="option" aria-selected={customer?.id===value.id} className={customer?.id===value.id?'selected':''} key={value.id} onClick={()=>setCustomer(value)}><strong>{value.name}</strong><small>{value.email}</small></button>)}</div>
        <label htmlFor="gaming-duration">Trajanje u minutima<input id="gaming-duration" type="number" min={15} max={480} value={duration} onChange={event=>setDuration(Number(event.target.value))}/></label>
        <Button type="submit" loading={busy==='start'} disabled={!customer}>Pokreni za {customer?.name??'izabranog klijenta'}</Button></form></Modal>
    <Modal open={customStation!==null} title="Prilagođeno produženje" onClose={()=>setCustomStation(null)}><form className="form-grid" onSubmit={event=>{event.preventDefault();if(customStation)void extend(customStation,customMinutes)}}>
      <label htmlFor="custom-extension">Broj minuta<input id="custom-extension" autoFocus type="number" min={1} max={120} value={customMinutes} onChange={event=>setCustomMinutes(Number(event.target.value))}/></label>
      <Button type="submit" loading={busy.startsWith('extend-')}>Produži sesiju</Button></form></Modal>
    <Modal open={endStation!==null} title={`Završi sesiju · ${endStation?.resourceName??''}`} onClose={()=>setEndStation(null)}><form className="form-grid" onSubmit={terminate}>
      <label htmlFor="gaming-end-reason">Razlog završetka<textarea id="gaming-end-reason" autoFocus required maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>
      <Button type="submit" variant="danger" loading={busy==='terminate'} disabled={!reason.trim()}>Potvrdi završetak</Button></form></Modal>
  </main>
}
