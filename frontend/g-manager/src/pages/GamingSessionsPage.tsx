import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { apiErrorMessage } from '../api/client'
import { Button, Drawer, EmptyState, ErrorState, Skeleton, TableShell } from '../components/ui'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { GamingSession } from '../types/gamingSession.types'

function displayRemaining(seconds:number) {
  return `${Math.floor(seconds/60)}m ${seconds%60}s`
}
function SessionRemaining({value}:{value:GamingSession}) {
  const [seconds,setSeconds]=useState(value.remainingSeconds)
  useEffect(()=>{setSeconds(value.remainingSeconds);const started=performance.now();const timer=window.setInterval(()=>
    setSeconds(Math.max(0,value.remainingSeconds-Math.floor((performance.now()-started)/1000))),1000)
    return()=>window.clearInterval(timer)},[value.id,value.remainingSeconds,value.serverTime])
  return <>{displayRemaining(seconds)}</>
}

export function GamingSessionsPage() {
  const sessions = useQuery({queryKey:['gaming-sessions','active'],queryFn:gamingSessionApi.active,refetchInterval:30000})
  const [selected,setSelected] = useState<GamingSession|null>(null)
  const [error,setError] = useState('')
  async function extend() { if(!selected)return; const raw=window.prompt('Produženje u minutima','30'); if(!raw)return
    try { const value=await gamingSessionApi.extend(selected.id,Number(raw),selected.version,crypto.randomUUID());setSelected(value);await sessions.refetch() }
    catch(cause){setError(apiErrorMessage(cause,'Sesiju nije moguće produžiti.'))} }
  async function terminate() { if(!selected)return; const reason=window.prompt('Razlog završetka')?.trim();if(!reason)return
    try { const value=await gamingSessionApi.terminate(selected.id,reason,selected.version,crypto.randomUUID());setSelected(value);await sessions.refetch() }
    catch(cause){setError(apiErrorMessage(cause,'Sesiju nije moguće završiti.'))} }
  return <main className="workspace"><div className="page-heading"><div><p className="eyebrow">Gaming operativa</p><h1>Aktivne gaming sesije</h1></div></div>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    {sessions.isLoading?<Skeleton lines={5} label="Učitavanje gaming sesija"/>:sessions.error?<ErrorState message={apiErrorMessage(sessions.error,'Sesije nisu dostupne.')} action={<Button onClick={()=>sessions.refetch()}>Pokušaj ponovo</Button>}/>:!sessions.data?.length?<EmptyState title="Nema aktivnih sesija" description="Sesiju pokrenite iz detalja klijenta."/>:
      <TableShell label="Aktivne gaming sesije"><table className="data-table"><thead><tr><th>Početak</th><th>Kraj</th><th>Preostalo</th><th>Stanica</th><th>Akcija</th></tr></thead><tbody>{sessions.data.map(value=><tr key={value.id}><td>{formatBusinessDateTime(value.startedAt)}</td><td>{formatBusinessDateTime(value.endsAt)}</td><td><SessionRemaining value={value}/></td><td>{value.resourceId}</td><td><Button variant="secondary" onClick={()=>setSelected(value)}>Detalji</Button></td></tr>)}</tbody></table></TableShell>}
    <Drawer open={selected!==null} title="Gaming session detalji" onClose={()=>setSelected(null)}>{selected&&<div>
      <p><strong>Status:</strong> {selected.status}</p><p><strong>Server time:</strong> {formatBusinessDateTime(selected.serverTime)}</p>
      <p><strong>Početak:</strong> {formatBusinessDateTime(selected.startedAt)}</p><p><strong>Kraj:</strong> {formatBusinessDateTime(selected.endsAt)}</p>
      <p><strong>Preostalo:</strong> <SessionRemaining value={selected}/></p>{selected.terminationReason&&<p><strong>Razlog:</strong> {selected.terminationReason}</p>}
      {selected.status==='ACTIVE'&&<div className="form-actions"><Button onClick={()=>void extend()}>Produži</Button><Button variant="danger" onClick={()=>void terminate()}>Završi</Button></div>}
    </div>}</Drawer>
  </main>
}
