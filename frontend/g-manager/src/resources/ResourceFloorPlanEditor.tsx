import { FloorPlanToolbar, type FloorPlanTool } from './FloorPlanToolbar'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useResettableState } from '../components/useResettableState'
import { lazy, Suspense, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { resourceApi } from '../api/resourceApi'
import { apiErrorMessage } from '../api/client'
import { Button, Card, Alert } from '../components/ui'
import type { AreaView, FloorPlanGeometry, LocationFloorPlan, ResourceAvailability, ResourcePosition, ResourceView } from '../types/resource.types'
const FloorPlanInspector = lazy(() => import('./FloorPlanInspector').then(module => ({ default: module.FloorPlanInspector })))
import { FloorPlanGeometryView } from './FloorPlanGeometryView'
import { localPosition, mapBounds, positionOf, resourceRect, resourceStatusLabels, type MapBounds, type MapResource, type MapSelection } from './floorPlanGeometry'

type Tool=FloorPlanTool
interface Point {x:number;y:number}
interface Gesture {pointerId:number;mode:'pan'|'move'|'draw';start:Point;client:Point;view:MapBounds;selection?:MapSelection;geometry:FloorPlanGeometry;positions:Record<string,ResourcePosition>}


export function ResourceFloorPlanEditor({plan,geometry,areas,resources,areaId,editing,onFinish,onDetails,onSaved}:{
  plan:LocationFloorPlan;geometry:FloorPlanGeometry;areas:AreaView[];resources:MapResource[];areaId:string;editing:boolean
  onFinish:()=>void;onDetails:(id:string)=>void;onSaved:(plan:LocationFloorPlan)=>void
}) {
  const client=useQueryClient(),svg=useRef<SVGSVGElement>(null),gesture=useRef<Gesture|null>(null),moved=useRef(false),inFlight=useRef(false)
  const gridId=useId().replace(/:/g,''),[draft,setDraft]=useState(geometry),[positions,setPositions]=useState<Record<string,ResourcePosition>>({})
  // Snapshot versions for the whole edit session; background refetches cannot silently bypass conflicts.
  const [baseline]=useState(()=>new Map(resources.filter(resource=>resource.details).map(resource=>[resource.id,resource.details!])))
  const [baseVersion]=useState(plan.version)
  const [areaVersions]=useState(()=>areas.map(area=>({id:area.id,version:area.version})))
  const [tool,setTool]=useState<Tool>('select'),[selection,setSelection]=useState<MapSelection|null>(null),[placing,setPlacing]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const current=editing?draft:geometry
  const bounds=useMemo(()=>mapBounds(current,areas,resources,positions,editing?'':areaId),[current,areas,resources,positions,editing,areaId])
  const {x:fitX,y:fitY,width:fitWidth,height:fitHeight}=bounds
  const [view,setView]=useResettableState(() => bounds, editing ? 'editing' : JSON.stringify([fitX,fitY,fitWidth,fitHeight]))
  const [preview,setPreview]=useState<{start:Point;end:Point}|null>(null)
  const dirty=editing&&(JSON.stringify(draft)!==JSON.stringify(geometry)||Object.keys(positions).length>0)
  useDirtyGuard(dirty || busy, { pending: busy })
  const { confirm, confirmationDialog } = useConfirmDialog()
  function finish() { if (busy) return; if (!dirty) onFinish(); else confirm({ title:'Odbaci raspored?', description:'Nesačuvana geometrija i pozicije biće odbačene.', variant:'warning', confirmLabel:'Odbaci izmene', onConfirm:onFinish }) }
  function point(event:ReactPointerEvent<SVGElement>):Point {
    const matrix=svg.current?.getScreenCTM()
    if(!matrix)return{x:0,y:0}
    const value=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())
    return{x:Math.max(0,Math.round(value.x)),y:Math.max(0,Math.round(value.y))}
  }
  function updatePosition(id:string,patch:Partial<ResourcePosition>) {
    const resource=baseline.get(id)
    if(!resource)return
    setPositions(values=>({...values,[id]:{...positionOf(resource),...values[id],...patch,id,version:resource.version}}))
  }
  function begin(event:ReactPointerEvent<SVGElement>,target?:MapSelection) {
    if(busy||event.button!==0||!event.isPrimary||gesture.current)return
    event.preventDefault();event.stopPropagation();moved.current=false;setMessage('')
    if(event.currentTarget.getAttribute('role')==='button')event.currentTarget.focus({preventScroll:true})
    else svg.current?.focus({preventScroll:true})
    const start=point(event)
    if(editing&&tool==='resource') {
      const resource=resources.find(value=>value.id===placing),area=areas.find(value=>value.id===resource?.areaId),room=current.rooms.find(value=>value.areaId===area?.id)
      if(!resource||!area||!room){setMessage('Izaberite postojeći resurs sa povezanom zonom.');return}
      if(start.x<room.x||start.y<room.y||start.x>room.x+room.width||start.y>room.y+room.height){setMessage(`Postavite resurs u prostoriju zone „${area.name}“.`);return}
      updatePosition(resource.id,localPosition(start.x,start.y,area,room));setSelection({kind:'resource',id:resource.id});setTool('select');moved.current=true;return
    }
    const mode=editing&&tool!=='select'?'draw':editing&&target?'move':'pan'
    if(editing)setSelection(target??null)
    gesture.current={pointerId:event.pointerId,mode,start,client:{x:event.clientX,y:event.clientY},view,selection:target,geometry:current,positions}
    svg.current?.setPointerCapture(event.pointerId)
    if(mode==='draw')setPreview({start,end:start})
  }
  function move(event:ReactPointerEvent<SVGSVGElement>) {
    const active=gesture.current
    if(!active||active.pointerId!==event.pointerId||busy)return
    const cursor=point(event),dx=cursor.x-active.start.x,dy=cursor.y-active.start.y
    if(Math.hypot(event.clientX-active.client.x,event.clientY-active.client.y)>4)moved.current=true
    if(active.mode==='pan') {
      const matrix=svg.current?.getScreenCTM(),scale=matrix?.a??1
      setView({...active.view,x:active.view.x-(event.clientX-active.client.x)/scale,y:active.view.y-(event.clientY-active.client.y)/scale});return
    }
    if(active.mode==='draw'){setPreview({start:active.start,end:cursor});return}
    const selected=active.selection
    if(!selected)return
    if(selected.kind==='room')setDraft({...active.geometry,rooms:active.geometry.rooms.map(room=>room.id===selected.id?{...room,x:Math.max(0,room.x+dx),y:Math.max(0,room.y+dy)}:room)})
    if(selected.kind==='wall'||selected.kind==='door') {
      const shift=<T extends {id:string;x1:number;y1:number;x2:number;y2:number}>(line:T):T=>{
        if(line.id!==selected.id)return line
        const x=Math.max(dx,-Math.min(line.x1,line.x2)),y=Math.max(dy,-Math.min(line.y1,line.y2))
        return{...line,x1:line.x1+x,y1:line.y1+y,x2:line.x2+x,y2:line.y2+y}
      }
      setDraft(selected.kind==='wall'?{...active.geometry,walls:active.geometry.walls.map(shift)}:{...active.geometry,doors:active.geometry.doors.map(shift)})
    }
    if(selected.kind==='resource') {
      const resource=resources.find(value=>value.id===selected.id),area=areas.find(value=>value.id===resource?.areaId),room=active.geometry.rooms.find(value=>value.areaId===area?.id)
      if(resource&&area&&room){const rect=resourceRect({...resource,...active.positions[resource.id]},area,room);updatePosition(resource.id,localPosition(rect.x+dx,rect.y+dy,area,room))}
    }
  }
  function end(event:ReactPointerEvent<SVGSVGElement>,cancelled=false) {
    const active=gesture.current
    if(!active||active.pointerId!==event.pointerId)return
    gesture.current=null
    if(svg.current?.hasPointerCapture(event.pointerId))svg.current.releasePointerCapture(event.pointerId)
    if(active&&!editing&&!cancelled&&active.selection?.kind==='resource'&&!moved.current) {
      onDetails(active.selection.id);moved.current=true
    }
    if(active?.mode==='draw'&&!cancelled) {
      const end=point(event),start=active.start,id=crypto.randomUUID()
      if(tool==='room'&&Math.abs(end.x-start.x)>=20&&Math.abs(end.y-start.y)>=20) {
        setDraft(value=>({...value,rooms:[...value.rooms,{id,label:'Nova prostorija',areaId:null,x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)}]}));setSelection({kind:'room',id})
      } else if((tool==='wall'||tool==='door')&&Math.hypot(end.x-start.x,end.y-start.y)>=10) {
        const line={id,x1:start.x,y1:start.y,x2:end.x,y2:end.y}
        setDraft(value=>tool==='wall'?{...value,walls:[...value.walls,{...line,thickness:8}]}:{...value,doors:[...value.doors,{...line,kind:'DOOR'}]});setSelection({kind:tool,id})
      }
      setTool('select')
    }
    setPreview(null)
  }
  function zoom(factor:number) {
    setView(value=>{const width=Math.max(bounds.width/8,Math.min(bounds.width*3,value.width*factor)),height=value.height*width/value.width;return{x:value.x+(value.width-width)/2,y:value.y+(value.height-height)/2,width,height}})
  }
  function addAtCenter() {
    const id=crypto.randomUUID(),x=Math.max(0,Math.round(view.x+view.width/2)),y=Math.max(0,Math.round(view.y+view.height/2))
    if(tool==='room')setDraft(value=>({...value,rooms:[...value.rooms,{id,label:'Nova prostorija',areaId:null,x,y,width:400,height:300}]}))
    else if(tool==='wall')setDraft(value=>({...value,walls:[...value.walls,{id,x1:x,y1:y,x2:x+200,y2:y,thickness:8}]}))
    else if(tool==='door')setDraft(value=>({...value,doors:[...value.doors,{id,x1:x,y1:y,x2:x+80,y2:y,kind:'DOOR'}]}))
    else return
    setSelection({kind:tool,id});setTool('select')
  }
  function remove() {
    if(!selection||selection.kind==='resource')return
    const selectedRoom=draft.rooms.find(room=>room.id===selection.id)
    if(selectedRoom?.areaId){setMessage('Odvojite poslovnu zonu od prostorije pre uklanjanja. Resursi moraju ostati vidljivi.');return}
    setDraft(value=>({...value,rooms:value.rooms.filter(item=>selection.kind!=='room'||item.id!==selection.id),walls:value.walls.filter(item=>selection.kind!=='wall'||item.id!==selection.id),doors:value.doors.filter(item=>selection.kind!=='door'||item.id!==selection.id)}));setSelection(null)
  }
  async function save() {
    if(inFlight.current)return
    const missing=areas.find(area=>!draft.rooms.some(room=>room.areaId===area.id))
    if(missing){setError(`Povežite zonu „${missing.name}“ sa prostorijom pre čuvanja.`);return}
    if(draft.rooms.some(room=>!room.label.trim())){setError('Svaka prostorija mora imati naziv.');return}
    inFlight.current=true;setBusy(true);setError('')
    try {
      const saved=await resourceApi.saveFloorPlan(plan.locationId,{version:baseVersion,geometry:draft,areaVersions,resourcePositions:Object.values(positions)})
      client.setQueryData(['resources','floor-plan',plan.locationId],saved)
      const updated=new Map(saved.resourcePositions.map(position=>[position.id,position]))
      client.setQueriesData<ResourceView[]>({queryKey:['resources','list']},values=>values?.map(resource=>({...resource,...updated.get(resource.id)})))
      client.setQueriesData<ResourceAvailability[]>({queryKey:['resources','availability']},values=>values?.map(resource=>{
        const position=updated.get(resource.id)
        return position?{...resource,x:position.x,y:position.y,width:position.width,height:position.height,rotation:position.rotation}:resource
      }))
      void client.invalidateQueries({queryKey:['resources']});void client.invalidateQueries({queryKey:['gaming-operations']});void client.invalidateQueries({queryKey:['stations']})
      onSaved(saved);onFinish()
    }catch(cause){setError(apiErrorMessage(cause,'Mapu nije moguće sačuvati. Izmene su ostale u editoru. Ako je verzija promenjena, otkažite izmene i ponovo otvorite editor.'))}
    finally{inFlight.current=false;setBusy(false)}
  }
  return <Card className="resource-map-panel" aria-label="Interaktivna mapa prostora">
    {confirmationDialog}
    <div className="resource-section-heading"><div><h2>{editing?'Uređivanje rasporeda':'Tlocrt prostora'}</h2><p>{editing?'Nacrtajte element ili prevucite postojeći. Izmene važe tek nakon čuvanja.':'Izaberite resurs za detalje. Statusi se odnose na izabrani interval od 60 minuta.'}</p></div>
      <div className="resource-map-zoom" aria-label="Uvećanje mape"><Button iconOnly variant="secondary" aria-label="Umanji mapu" onClick={()=>zoom(1.25)}>−</Button><Button variant="secondary" onClick={()=>setView(bounds)}>Cela mapa</Button><Button iconOnly variant="secondary" aria-label="Uvećaj mapu" onClick={()=>zoom(.8)}>+</Button></div>
    </div>
    {editing&&<FloorPlanToolbar tool={tool} onTool={value=>{setTool(value);setMessage('')}} busy={busy} onAdd={addAtCenter} onSave={()=>void save()} onCancel={finish}
      placing={placing} onPlacing={setPlacing} resources={resources.filter(resource=>baseline.has(resource.id))}/>}
    {error&&<Alert tone="danger" role="alert">{error}</Alert>}{message&&<p className="resource-map-hint" role="status">{message}</p>}
    <div className={`resource-map-canvas${editing?' is-editing':''}`}>
      <svg ref={svg} role="group" tabIndex={0} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label="2D mapa lokala. Strelice pomeraju mapu, plus i minus menjaju uvećanje, Home prikazuje celu mapu. Resursi otvaraju detalje." onPointerDown={event=>begin(event)} onPointerMove={move} onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)} onKeyDown={event=>{
        if(event.target!==event.currentTarget)return
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();setView(value=>({...value,x:value.x+(event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0)*value.width*.08,y:value.y+(event.key==='ArrowUp'?-1:event.key==='ArrowDown'?1:0)*value.height*.08}))}
        if(event.key==='+'||event.key==='='){event.preventDefault();zoom(.8)}if(event.key==='-'){event.preventDefault();zoom(1.25)}if(event.key==='Home'){event.preventDefault();setView(bounds)}
      }}>
        <defs><pattern id={gridId} width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" className="resource-grid-dot"/></pattern></defs>
        <rect x={view.x} y={view.y} width={view.width} height={view.height} fill={`url(#${gridId})`}/>
        <FloorPlanGeometryView geometry={current} areas={areas} resources={resources} areaId={areaId} editing={editing} busy={busy} positions={positions} selection={selection} onSelection={setSelection} onPointerDown={begin} onDetails={onDetails} moved={moved}/>
        {preview&&(tool==='room'?<rect className="resource-draw-preview" x={Math.min(preview.start.x,preview.end.x)} y={Math.min(preview.start.y,preview.end.y)} width={Math.abs(preview.end.x-preview.start.x)} height={Math.abs(preview.end.y-preview.start.y)}/>:<line className="resource-draw-preview" x1={preview.start.x} y1={preview.start.y} x2={preview.end.x} y2={preview.end.y}/>)}
      </svg>
    </div>
    <div className="resource-map-legend">{Object.entries(resourceStatusLabels).map(([status,label])=><span key={status} className={`resource-state-${status.toLowerCase()}`}><i aria-hidden="true"/>{label}</span>)}<span className="resource-pan-hint">Prevucite praznu površinu za pomeranje mape.</span></div>
    {editing&&<Suspense fallback={<p>Učitavanje uređivača…</p>}><FloorPlanInspector selection={selection} geometry={draft} areas={areas} resources={resources} positions={positions} onGeometry={setDraft} onPosition={updatePosition} onRemove={remove} disabled={busy}/></Suspense>}
  </Card>
}
