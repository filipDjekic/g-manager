import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, EmptyState, Input, Select, TableShell } from '../components/ui'
import { ResourceIcon } from './ResourceIcon'
import { ResourceMenu, type ResourceMenuAction } from './ResourceMenu'
import { resourceStatusLabels, resourceStatusTones, resourceTypeLabels, type MapResource } from './floorPlanGeometry'

export function ResourceTable({resources,areaId,actions}:{resources:MapResource[];areaId:string;actions:(resource:MapResource)=>ResourceMenuAction[]}) {
  const [params,setParams]=useSearchParams(),[search,setSearch]=useState(''),[type,setType]=useState(''),[status,setStatus]=useState(''),[sort,setSort]=useState('name')
  const filtered=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase('sr')
    return resources.filter(resource=>(!areaId||resource.areaId===areaId)&&(!type||resource.type===type)&&(!status||resource.status===status)&&(!query||`${resource.name} ${resource.code}`.toLocaleLowerCase('sr').includes(query)))
      .sort((a,b)=>{const left=sort==='area'?a.areaName:sort==='type'?resourceTypeLabels[a.type]:sort==='status'?resourceStatusLabels[a.status]:a.name,right=sort==='area'?b.areaName:sort==='type'?resourceTypeLabels[b.type]:sort==='status'?resourceStatusLabels[b.status]:b.name;return left.localeCompare(right,'sr',{numeric:true})*(sort==='name-desc'?-1:1)||a.id.localeCompare(b.id)})
  },[resources,areaId,search,type,status,sort])
  const total=filtered.length,pages=Math.max(1,Math.ceil(total/10)),raw=params.get('resourcePage')??'1'
  const requested=/^[1-9]\d*$/.test(raw)&&Number.isSafeInteger(Number(raw))?Number(raw):1,page=Math.min(requested,pages)
  const changePage=(next:number)=>setParams(current=>{const updated=new URLSearchParams(current);if(next===1)updated.delete('resourcePage');else updated.set('resourcePage',String(next));return updated},{replace:true})
  useEffect(()=>{if(raw!==String(page))setParams(current=>{const updated=new URLSearchParams(current);if(page===1)updated.delete('resourcePage');else updated.set('resourcePage',String(page));return updated},{replace:true})},[raw,page,setParams])
  const numbers=Array.from({length:Math.min(pages,5)},(_,index)=>Math.max(1,Math.min(page-2,pages-4))+index)
  const lastNumber=numbers[numbers.length-1]
  return <section className="resource-table-panel" aria-label={areaId?'Resursi u zoni':'Svi resursi'}>
    <div className="resource-section-heading"><h2>{areaId?'Resursi u zoni':'Svi resursi'}</h2><span>{total} {total===1?'resurs':'resursa'}</span></div>
    <div className="resource-table-filters">
      <label>Pretraga<Input type="search" placeholder="Naziv ili šifra resursa" value={search} onChange={event=>{setSearch(event.target.value);changePage(1)}}/></label>
      <label>Tip<Select value={type} onChange={event=>{setType(event.target.value);changePage(1)}}><option value="">Svi tipovi</option>{Object.entries(resourceTypeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></label>
      <label>Status intervala<Select value={status} onChange={event=>{setStatus(event.target.value);changePage(1)}}><option value="">Svi statusi</option>{Object.entries(resourceStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></label>
      <label>Sortiranje<Select value={sort} onChange={event=>{setSort(event.target.value);changePage(1)}}><option value="name">Naziv A–Z</option><option value="name-desc">Naziv Z–A</option><option value="type">Tip</option><option value="area">Zona</option><option value="status">Status</option></Select></label>
    </div>
    {!total?<EmptyState title="Nema resursa za ovaj izbor" description="Promenite pretragu ili filtere. Mapa prikazuje sve resurse iz izabranog prostora."/>:<TableShell label="Tabela resursa"><table><thead><tr><th scope="col">Naziv resursa</th><th scope="col">Tip</th><th scope="col">Zona</th><th scope="col">Status intervala</th><th scope="col"><span className="resource-visually-hidden">Akcije</span></th></tr></thead><tbody>
      {filtered.slice((page-1)*10,page*10).map(resource=><tr key={resource.id}><td><div className="resource-table-name"><ResourceIcon type={resource.type}/><div><strong>{resource.name}</strong><small>{resource.code}</small></div></div></td><td>{resourceTypeLabels[resource.type]}</td><td>{resource.areaName}</td><td><Badge tone={resourceStatusTones[resource.status]}>{resourceStatusLabels[resource.status]}</Badge></td><td><ResourceMenu label={`Akcije · ${resource.name}`} actions={actions(resource)}>⋯</ResourceMenu></td></tr>)}
    </tbody></table></TableShell>}
    <div className="resource-table-pagination"><span aria-live="polite">Prikazano {total?(page-1)*10+1:0}–{Math.min(page*10,total)} od {total}</span><nav aria-label="Stranice resursa">
      <Button variant="secondary" disabled={page===1} onClick={()=>changePage(page-1)}>Prethodna</Button>
      {numbers[0]>1&&<><Button variant="secondary" onClick={()=>changePage(1)}>1</Button>{numbers[0]>2&&<span aria-hidden="true">…</span>}</>}
      {numbers.map(number=><Button key={number} variant="secondary" aria-current={number===page?'page':undefined} onClick={()=>changePage(number)}>{number}</Button>)}
      {lastNumber<pages&&<>{lastNumber<pages-1&&<span aria-hidden="true">…</span>}<Button variant="secondary" onClick={()=>changePage(pages)}>{pages}</Button></>}
      <Button variant="secondary" disabled={page===pages} onClick={()=>changePage(page+1)}>Sledeća</Button>
    </nav></div>
  </section>
}
