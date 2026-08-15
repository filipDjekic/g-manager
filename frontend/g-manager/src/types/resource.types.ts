export type ResourceType = 'GAMING_PC' | 'PLAYSTATION' | 'SIMULATOR' | 'VIP_ROOM' | 'OTHER'
export interface LocationView { id:string;code:string;name:string;address:string;description?:string;timezone:string;active:boolean;version:number }
export interface AreaView { id:string;locationId:string;code:string;name:string;description?:string;active:boolean;displayOrder:number;mapWidth:number;mapHeight:number;version:number }
export interface ResourceView { id:string;areaId:string;serviceId:string;code:string;name:string;type:ResourceType;description?:string;active:boolean;bookable:boolean;capacity:number;displayOrder:number;x:number;y:number;width:number;height:number;rotation:number;version:number }
export interface ResourceAvailability extends ResourceView { status:'AVAILABLE'|'OCCUPIED'|'INACTIVE';start:string;end:string }
