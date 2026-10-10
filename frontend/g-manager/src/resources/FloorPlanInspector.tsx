import { Button, Input, Select } from '../components/ui'
import type { AreaView, FloorPlanGeometry, ResourcePosition } from '../types/resource.types'
import { resourceTypeLabels, type MapResource, type MapSelection } from './floorPlanGeometry'

export function FloorPlanInspector({selection,geometry,areas,resources,positions,onGeometry,onPosition,onRemove,disabled}:{
  selection:MapSelection|null;geometry:FloorPlanGeometry;areas:AreaView[];resources:MapResource[];positions:Record<string,ResourcePosition>
  onGeometry:(geometry:FloorPlanGeometry)=>void;onPosition:(id:string,patch:Partial<ResourcePosition>)=>void;onRemove:()=>void;disabled:boolean
}) {
  if(!selection)return <p className="resource-map-hint">Izaberite element za precizno podešavanje. Prevucite prostoriju ili resurs, ili nacrtajte element izabranim alatom.</p>
  const room=selection.kind==='room'?geometry.rooms.find(item=>item.id===selection.id):undefined
  const wall=selection.kind==='wall'?geometry.walls.find(item=>item.id===selection.id):undefined
  const door=selection.kind==='door'?geometry.doors.find(item=>item.id===selection.id):undefined
  const resource=selection.kind==='resource'?resources.find(item=>item.id===selection.id):undefined
  const number=(label:string,value:number,onChange:(value:number)=>void,min=0,integer=false)=><label key={label}>{label}<Input type="number" min={min} max={10000000} step={integer?1:'any'} required disabled={disabled} value={value} onChange={event=>{const next=Number(event.target.value);if(Number.isFinite(next))onChange(Math.max(min,integer?Math.round(next):next))}}/></label>
  const updateRoom=(patch:Partial<NonNullable<typeof room>>)=>onGeometry({...geometry,rooms:geometry.rooms.map(item=>item.id===room?.id?{...item,...patch}:item)})
  const updateWall=(patch:Partial<NonNullable<typeof wall>>)=>onGeometry({...geometry,walls:geometry.walls.map(item=>item.id===wall?.id?{...item,...patch}:item)})
  const updateDoor=(patch:Partial<NonNullable<typeof door>>)=>onGeometry({...geometry,doors:geometry.doors.map(item=>item.id===door?.id?{...item,...patch}:item)})
  return <section className="resource-map-inspector" aria-label="Podešavanje izabranog elementa">
    <div className="resource-section-heading"><strong>{room?'Prostorija':wall?'Zid':door?'Vrata / prolaz':resource?.name}</strong>{!resource&&<Button variant="secondary" disabled={disabled} onClick={onRemove}>Ukloni element</Button>}</div>
    <div className="resource-precision-fields">
      {room&&<><label>Naziv<Input required maxLength={120} disabled={disabled} value={room.label} onChange={event=>updateRoom({label:event.target.value})}/></label><label>Poslovna zona<Select value={room.areaId??''} disabled={disabled} onChange={event=>updateRoom({areaId:event.target.value||null})}><option value="">Bez poslovne zone</option>{areas.map(area=><option key={area.id} value={area.id} disabled={geometry.rooms.some(item=>item.id!==room.id&&item.areaId===area.id)}>{area.name}</option>)}</Select></label>
        {number('X',room.x,x=>updateRoom({x}))}{number('Y',room.y,y=>updateRoom({y}))}{number('Širina',room.width,width=>updateRoom({width}),1)}{number('Visina',room.height,height=>updateRoom({height}),1)}
      </>}
      {(wall||door)&&<>{number('X1',(wall??door)!.x1,x1=>wall?updateWall({x1}):updateDoor({x1}))}{number('Y1',(wall??door)!.y1,y1=>wall?updateWall({y1}):updateDoor({y1}))}{number('X2',(wall??door)!.x2,x2=>wall?updateWall({x2}):updateDoor({x2}))}{number('Y2',(wall??door)!.y2,y2=>wall?updateWall({y2}):updateDoor({y2}))}</>}
      {wall&&number('Debljina',wall.thickness,thickness=>updateWall({thickness}),1)}
      {door&&<label>Vrsta<Select disabled={disabled} value={door.kind} onChange={event=>updateDoor({kind:event.target.value as 'DOOR'|'PASSAGE'})}><option value="DOOR">Vrata</option><option value="PASSAGE">Prolaz</option></Select></label>}
      {resource?.details&&(()=>{const value={...resource.details,...positions[resource.id]};return <>
        {number('X u zoni',value.x,x=>onPosition(resource.id,{x}),0,true)}{number('Y u zoni',value.y,y=>onPosition(resource.id,{y}),0,true)}
        {number('Širina u zoni',value.width,width=>onPosition(resource.id,{width}),1,true)}{number('Visina u zoni',value.height,height=>onPosition(resource.id,{height}),1,true)}
        {number('Rotacija °',value.rotation,rotation=>onPosition(resource.id,{rotation}),-360,true)}
      </>})()}
    </div>
    {resource&&<p className="resource-map-hint">{resourceTypeLabels[resource.type]} · {resource.areaName}. Koordinate i dimenzije su u postojećem koordinatnom sistemu zone. Pomeranje ne menja zonu, uslugu ni rezervacije.</p>}
    {room&&<p className="resource-map-hint">Prostorija određuje vizuelni položaj zone. Nova poslovna zona kreira se kroz „Upravljaj prostorom“.</p>}
  </section>
}
