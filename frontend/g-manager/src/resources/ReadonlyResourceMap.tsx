import { useId, useMemo, useRef, type PointerEvent } from 'react'
import { Button, Card } from '../components/ui'
import { useResettableState } from '../components/useResettableState'
import { FloorPlanGeometryView } from './FloorPlanGeometryView'
import { mapBounds, resourceStatusLabels, type MapBounds } from './floorPlanGeometry'
import type { ResourceMapProps } from './ResourceFloorMap'

export function ReadonlyResourceMap({ geometry, areas, resources, areaId, onDetails }: ResourceMapProps) {
  const svg = useRef<SVGSVGElement>(null), gridId = useId().replace(/:/g,''), moved = useRef(false)
  const gesture = useRef<{ id:number; x:number; y:number; view:MapBounds; resourceId?:string } | null>(null)
  const bounds = useMemo(()=>mapBounds(geometry,areas,resources,{},areaId),[geometry,areas,resources,areaId])
  const [view,setView] = useResettableState(()=>bounds,JSON.stringify(bounds))
  function zoom(factor:number) {
    setView(value=>{const width=Math.max(bounds.width/8,Math.min(bounds.width*3,value.width*factor)),height=value.height*width/value.width
      return {x:value.x+(value.width-width)/2,y:value.y+(value.height-height)/2,width,height}})
  }
  function begin(event:PointerEvent<SVGElement>,resourceId?:string) {
    if(event.button!==0||!event.isPrimary||gesture.current)return
    event.preventDefault();event.stopPropagation();moved.current=false
    if(resourceId)event.currentTarget.focus({preventScroll:true});else svg.current?.focus({preventScroll:true})
    gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,view,resourceId}
    svg.current?.setPointerCapture(event.pointerId)
  }
  function move(event:PointerEvent<SVGSVGElement>) {
    const active=gesture.current;if(!active||active.id!==event.pointerId)return
    const dx=event.clientX-active.x,dy=event.clientY-active.y
    if(Math.hypot(dx,dy)>4)moved.current=true
    if(!moved.current)return
    const scale=svg.current?.getScreenCTM()?.a??1
    setView({...active.view,x:active.view.x-dx/scale,y:active.view.y-dy/scale})
  }
  function end(event:PointerEvent<SVGSVGElement>,cancelled=false) {
    const active=gesture.current;if(!active||active.id!==event.pointerId)return
    gesture.current=null
    if(svg.current?.hasPointerCapture(event.pointerId))svg.current.releasePointerCapture(event.pointerId)
    if(!cancelled&&!moved.current&&active.resourceId){onDetails(active.resourceId);moved.current=true}
  }
  return <Card className="resource-map-panel" aria-label="Interaktivna mapa prostora">
    <div className="resource-section-heading"><div><h2>Dostupnost za termin</h2><p>Izaberite mesto za detalje. Status važi za izabrani početak i narednih 60 minuta.</p></div>
      <div className="resource-map-zoom"><Button iconOnly variant="secondary" aria-label="Umanji mapu" onClick={()=>zoom(1.25)}>−</Button><Button variant="secondary" onClick={()=>setView(bounds)}>Cela mapa</Button><Button iconOnly variant="secondary" aria-label="Uvećaj mapu" onClick={()=>zoom(.8)}>+</Button></div>
    </div>
    <div className="resource-map-canvas"><svg ref={svg} role="group" tabIndex={0} viewBox={[view.x,view.y,view.width,view.height].join(' ')}
      aria-label="Mapa prostora. Strelice pomeraju mapu, plus i minus menjaju uvećanje, Home prikazuje celu mapu. Enter otvara izabrani resurs."
      onPointerDown={event=>begin(event)} onPointerMove={move} onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)} onKeyDown={event=>{
        if(event.target!==event.currentTarget)return
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();setView(value=>({...value,x:value.x+(event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0)*value.width*.08,y:value.y+(event.key==='ArrowUp'?-1:event.key==='ArrowDown'?1:0)*value.height*.08}))}
        if(event.key==='+'||event.key==='='){event.preventDefault();zoom(.8)}if(event.key==='-'){event.preventDefault();zoom(1.25)}if(event.key==='Home'){event.preventDefault();setView(bounds)}
      }}>
      <defs><pattern id={gridId} width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" className="resource-grid-dot"/></pattern></defs>
      <rect x={view.x} y={view.y} width={view.width} height={view.height} fill={'url(#'+gridId+')'}/>
      <FloorPlanGeometryView geometry={geometry} areas={areas} resources={resources} areaId={areaId} moved={moved} onDetails={onDetails} onPointerDown={(event,selection)=>begin(event,selection?.kind==='resource'?selection.id:undefined)}/>
    </svg></div>
    <div className="resource-map-legend">{Object.entries(resourceStatusLabels).map(([status,label])=><span key={status} className={'resource-state-'+status.toLowerCase()}><i aria-hidden="true"/>{label}</span>)}<span className="resource-pan-hint">Prevucite praznu površinu za pomeranje. Prikaz Lista daje iste podatke bez korišćenja mape.</span></div>
  </Card>
}
