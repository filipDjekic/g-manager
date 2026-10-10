export interface BookingResource {
  id: string; serviceId: string; code: string; name: string; type: ResourceType
  locationId: string; locationName: string; available: boolean
}
export interface BookingOptions { resourceRequired: boolean; resources: BookingResource[] }

export type ResourceType = 'GAMING_PC' | 'PLAYSTATION' | 'SIMULATOR' | 'VIP_ROOM' | 'OTHER'
export interface LocationView { id:string;code:string;name:string;address:string;description?:string;timezone:string;active:boolean;version:number }
export interface AreaView { id:string;locationId:string;code:string;name:string;description?:string;active:boolean;displayOrder:number;mapWidth:number;mapHeight:number;version:number }
export interface ResourceView { id:string;areaId:string;serviceId:string;code:string;name:string;type:ResourceType;description?:string;active:boolean;bookable:boolean;capacity:number;displayOrder:number;x:number;y:number;width:number;height:number;rotation:number;version:number }
export interface ResourceAvailability extends Omit<ResourceView,'description'|'active'|'bookable'|'capacity'|'displayOrder'|'version'> { status:'AVAILABLE'|'OCCUPIED'|'INACTIVE'|'MAINTENANCE'|'RETIRED';start:string;end:string }
export type LocationInput=Omit<LocationView,'id'|'version'> & {version?:number}
export type AreaInput=Omit<AreaView,'id'|'locationId'|'version'> & {version?:number}
export type ResourceInput=Omit<ResourceView,'id'|'areaId'|'version'> & {version?:number}

export interface FloorPlanRoom { id:string;label:string;areaId:string|null;x:number;y:number;width:number;height:number }
export interface FloorPlanWall { id:string;x1:number;y1:number;x2:number;y2:number;thickness:number }
export interface FloorPlanDoor { id:string;kind:'DOOR'|'PASSAGE';x1:number;y1:number;x2:number;y2:number }
export interface FloorPlanGeometry { rooms:FloorPlanRoom[];walls:FloorPlanWall[];doors:FloorPlanDoor[] }
export interface LocationFloorPlan { locationId:string;version:number;geometry:FloorPlanGeometry }
export type ResourcePosition=Pick<ResourceView,'id'|'version'|'x'|'y'|'width'|'height'|'rotation'>
export interface FloorPlanInput { version:number;geometry:FloorPlanGeometry;areaVersions:Pick<AreaView,'id'|'version'>[];resourcePositions:ResourcePosition[] }
export interface FloorPlanSaveResult extends LocationFloorPlan { resourcePositions:ResourcePosition[] }
