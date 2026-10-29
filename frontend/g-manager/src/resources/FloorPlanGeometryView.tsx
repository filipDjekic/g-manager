import type { PointerEvent } from 'react'
import type { AreaView, FloorPlanGeometry, ResourcePosition } from '../types/resource.types'
import { ResourceIcon } from './ResourceIcon'
import { resourceRect, resourceStatusLabels, type MapResource, type MapSelection } from './floorPlanGeometry'

export function FloorPlanGeometryView({ geometry: current, areas, resources, areaId, editing = false, busy = false, positions = {}, selection = null, onSelection, onPointerDown: begin, onDetails, moved }: {
  geometry: FloorPlanGeometry; areas: AreaView[]; resources: MapResource[]; areaId: string; editing?: boolean; busy?: boolean
  positions?: Record<string,ResourcePosition>; selection?: MapSelection | null; onSelection?: (value: MapSelection | null) => void
  onPointerDown: (event: PointerEvent<SVGElement>, selection?: MapSelection) => void; onDetails: (id: string) => void; moved: { current: boolean }
}) {
  const setSelection = onSelection ?? (() => undefined)
  const visibleRooms = current.rooms.filter(room=>editing||!areaId||room.areaId===areaId)
  const visibleResources = resources.filter(resource=>editing||!areaId||resource.areaId===areaId)
  return <>
        {visibleRooms.map(room=><g key={room.id} role={editing?'button':undefined} tabIndex={editing&&!busy?0:undefined} aria-label={editing?`Izaberi prostoriju ${room.label}`:undefined} className={`resource-map-room${selection?.id===room.id?' is-selected':''}`} onPointerDown={event=>begin(event,{kind:'room',id:room.id})} onKeyDown={event=>{if(editing&&(event.key==='Enter'||event.key===' ')){event.preventDefault();setSelection({kind:'room',id:room.id})}}}>
          <rect x={room.x} y={room.y} width={room.width} height={room.height} rx="8"/>
          <text x={room.x+4} y={room.y-14}>{room.label}</text>
        </g>)}
        {current.walls.map((wall,index)=><g key={wall.id} role={editing?'button':undefined} tabIndex={editing&&!busy?0:undefined} aria-label={editing?`Izaberi zid ${index+1}`:undefined} className={`resource-map-wall${selection?.id===wall.id?' is-selected':''}`} onPointerDown={event=>begin(event,{kind:'wall',id:wall.id})} onKeyDown={event=>{if(editing&&(event.key==='Enter'||event.key===' ')){event.preventDefault();setSelection({kind:'wall',id:wall.id})}}}><line {...{x1:wall.x1,y1:wall.y1,x2:wall.x2,y2:wall.y2}} strokeWidth={wall.thickness}/><line className="resource-line-hit" {...{x1:wall.x1,y1:wall.y1,x2:wall.x2,y2:wall.y2}}/></g>)}
        {current.doors.map((door, index) => (
          <g
            key={door.id}
            role={editing ? 'button' : undefined}
            tabIndex={editing && !busy ? 0 : undefined}
            aria-label={editing ? `Izaberi vrata ili prolaz ${index + 1}` : undefined}
            className={`resource-map-door${selection?.id === door.id ? ' is-selected' : ''}`}
            onPointerDown={event => begin(event, { kind: 'door', id: door.id })}
            onKeyDown={event => {
              if (editing && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault()
                setSelection({ kind: 'door', id: door.id })
              }
            }}
          >
            <line
              className="resource-door-gap"
              {...{ x1: door.x1, y1: door.y1, x2: door.x2, y2: door.y2 }}
            />
            <line
              className={door.kind === 'PASSAGE' ? 'resource-passage' : 'resource-door-leaf'}
              {...{ x1: door.x1, y1: door.y1, x2: door.x2, y2: door.y2 }}
            />
            {door.kind === 'DOOR' && (
              <path
                className="resource-door-arc"
                d={`M ${door.x2} ${door.y2} A ${Math.hypot(door.x2-door.x1,door.y2-door.y1)} ${Math.hypot(door.x2-door.x1,door.y2-door.y1)} 0 0 0 ${door.x1-(door.y2-door.y1)} ${door.y1+(door.x2-door.x1)}`}
              />
            )}
            <line
              className="resource-line-hit"
              {...{ x1: door.x1, y1: door.y1, x2: door.x2, y2: door.y2 }}
            />
          </g>
        ))}
        {visibleResources.map(resource=>{
          const area=areas.find(item=>item.id===resource.areaId),room=current.rooms.find(item=>item.areaId===resource.areaId)
          if(!area||!room)return null
          const rect=resourceRect({...resource,...positions[resource.id]},area,room)
          const select=()=>{if(editing)setSelection({kind:'resource',id:resource.id});else onDetails(resource.id)}
          return <g key={resource.id} role="button" tabIndex={busy?-1:0} aria-label={`${resource.name} · ${resourceStatusLabels[resource.status]} za izabrani interval · ${resource.areaName}`} className={`resource-map-node resource-state-${resource.status.toLowerCase()}${selection?.id===resource.id?' is-selected':''}`} transform={`translate(${rect.x} ${rect.y}) scale(${rect.scaleX} ${rect.scaleY}) rotate(${rect.rotation} ${rect.localWidth/2} ${rect.localHeight/2})`}
            onPointerDown={event=>begin(event,{kind:'resource',id:resource.id})} onClick={event=>{if(event.detail===0||!moved.current)select()}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select()}}}>
            <title>{resource.name} · {resourceStatusLabels[resource.status]} · {resource.areaName}</title>
            <rect width={rect.localWidth} height={rect.localHeight} rx="8"/>
            <ResourceIcon type={resource.type} x="10" y="10" width={Math.min(28,rect.localWidth/4)} height={Math.min(28,rect.localHeight/3)}/>
            <foreignObject x="10" y={Math.min(42,rect.localHeight*.45)} width={Math.max(1,rect.localWidth-20)} height={Math.max(1,rect.localHeight-Math.min(42,rect.localHeight*.45)-5)}><div className="resource-node-label"><strong>{resource.name}</strong><small>{resourceStatusLabels[resource.status]}</small></div></foreignObject>
          </g>
        })}
  </>
}
