import type { AreaView, FloorPlanGeometry, FloorPlanRoom, ResourceAvailability, ResourcePosition, ResourceView } from '../types/resource.types'

export const resourceTypeLabels = { GAMING_PC:'Gaming računar', PLAYSTATION:'PlayStation', SIMULATOR:'Simulator', VIP_ROOM:'VIP soba', OTHER:'Drugi resurs' }
export const resourceStatusLabels = { AVAILABLE:'Slobodan', OCCUPIED:'Zauzet', MAINTENANCE:'Održavanje', INACTIVE:'Van funkcije', RETIRED:'Van upotrebe' }
export const resourceStatusTones = { AVAILABLE:'success', OCCUPIED:'warning', MAINTENANCE:'warning', INACTIVE:'danger', RETIRED:'neutral' } as const
export type MapResource = ResourceAvailability & { details?:ResourceView;areaName:string }
export type MapSelection = { kind:'room'|'wall'|'door'|'resource';id:string }
export interface MapBounds { x:number;y:number;width:number;height:number }

// Missing layouts and newly created Areas receive deterministic visual rooms.
// Business entities and their existing Area-local coordinates are never recreated.
export function completeGeometry(saved:FloorPlanGeometry, areas:AreaView[], resources:ResourceView[]):FloorPlanGeometry {
  const rooms=saved.rooms.map(room=>({...room}))
  let nextY=Math.max(0,...rooms.map(room=>room.y+room.height))+60
  const missing=areas.filter(area=>!rooms.some(room=>room.areaId===area.id))
  for(let index=0;index<missing.length;index+=2) {
    let nextX=60,rowHeight=0
    for(const area of missing.slice(index,index+2)) {
      const own=resources.filter(resource=>resource.areaId===area.id)
      const width=Math.max(area.mapWidth,...own.map(resource=>resource.x+resource.width+40))
      const height=Math.max(area.mapHeight,...own.map(resource=>resource.y+resource.height+40))
      rooms.push({id:`area-${area.id}`,label:area.name,areaId:area.id,x:nextX,y:nextY,width,height})
      nextX+=width+60;rowHeight=Math.max(rowHeight,height)
    }
    nextY+=rowHeight+60
  }
  return {rooms,walls:saved.walls.map(wall=>({...wall})),doors:saved.doors.map(door=>({...door}))}
}

// Location position = room origin + Area position scaled to the drawn room.
export function resourceRect(resource:Pick<ResourceView,'areaId'|'x'|'y'|'width'|'height'|'rotation'>, area:AreaView, room:FloorPlanRoom) {
  const sx=room.width/area.mapWidth,sy=room.height/area.mapHeight
  return {x:room.x+resource.x*sx,y:room.y+resource.y*sy,width:resource.width*sx,height:resource.height*sy,localWidth:resource.width,localHeight:resource.height,scaleX:sx,scaleY:sy,rotation:resource.rotation}
}
export function localPosition(x:number,y:number,area:AreaView,room:FloorPlanRoom) {
  return {x:Math.max(0,Math.round((x-room.x)*area.mapWidth/room.width)),y:Math.max(0,Math.round((y-room.y)*area.mapHeight/room.height))}
}
export function positionOf(resource:ResourceView):ResourcePosition {
  return {id:resource.id,version:resource.version,x:resource.x,y:resource.y,width:resource.width,height:resource.height,rotation:resource.rotation}
}
export function mapBounds(geometry:FloorPlanGeometry,areas:AreaView[],resources:MapResource[],positions:Record<string,ResourcePosition>,areaId:string):MapBounds {
  const rooms=geometry.rooms.filter(room=>!areaId||room.areaId===areaId)
  const boxes=rooms.map(room=>({x:room.x,y:room.y,width:room.width,height:room.height}))
  for(const resource of resources) {
    const area=areas.find(value=>value.id===resource.areaId),room=rooms.find(value=>value.areaId===resource.areaId)
    if(!area||!room)continue
    const rect=resourceRect({...resource,...positions[resource.id]},area,room)
    const angle=rect.rotation*Math.PI/180
    // Rotate in Area space first, then scale to the room (also for non-uniform scales).
    const width=(Math.abs(rect.localWidth*Math.cos(angle))+Math.abs(rect.localHeight*Math.sin(angle)))*rect.scaleX
    const height=(Math.abs(rect.localWidth*Math.sin(angle))+Math.abs(rect.localHeight*Math.cos(angle)))*rect.scaleY
    boxes.push({x:rect.x+rect.width/2-width/2,y:rect.y+rect.height/2-height/2,width,height})
  }
  if(!areaId)for(const line of [...geometry.walls,...geometry.doors])boxes.push({x:Math.min(line.x1,line.x2),y:Math.min(line.y1,line.y2),width:Math.abs(line.x2-line.x1),height:Math.abs(line.y2-line.y1)})
  if(!boxes.length)return{x:0,y:0,width:1000,height:650}
  const x=Math.min(...boxes.map(box=>box.x))-50,y=Math.min(...boxes.map(box=>box.y))-50
  return{x,y,width:Math.max(300,Math.max(...boxes.map(box=>box.x+box.width))-x+50),height:Math.max(220,Math.max(...boxes.map(box=>box.y+box.height))-y+50)}
}
