export type StationOperationalStatus = 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED'
export type StationEffectiveStatus = StationOperationalStatus | 'IN_SESSION' | 'OFFLINE'
export type ApplicationType = 'LAUNCHER' | 'GAME' | 'HELPER'

export interface ApplicationDefinition {
  id:string;code:string;name:string;type:ApplicationType;executablePath:string
  publisher?:string;executableSha256?:string;defaultArguments?:string;active:boolean;version:number
}
export interface ApplicationDefinitionInput extends Omit<ApplicationDefinition, 'id'|'version'> { version?:number }
export interface ApplicationProfileEntry {
  id:string;applicationDefinitionId:string;applicationName:string;applicationType:ApplicationType
  requiredProcess:boolean;autoStart:boolean;launchOrder:number;argumentsOverride?:string;version:number
}
export interface ApplicationProfile {
  id:string;code:string;name:string;description?:string;active:boolean
  configurationVersion:number;version:number;entries:ApplicationProfileEntry[]
}
export interface ApplicationProfileInput {
  code:string;name:string;description?:string;active:boolean;version?:number
  entries:Array<{applicationDefinitionId:string;requiredProcess:boolean;autoStart:boolean;launchOrder:number;argumentsOverride?:string}>
}
export interface StationOverview {
  stationProfileId?:string;resourceId:string;resourceCode:string;resourceName:string
  areaId:string;locationId:string;operationalStatus:StationOperationalStatus
  effectiveStatus:StationEffectiveStatus;applicationProfileId?:string;applicationProfileName?:string
  configurationVersion:number;clientEnabled:boolean;heartbeatIntervalSeconds:number
  offlineGraceSeconds:number;lastHeartbeatAt?:string;clientVersion?:string;activeSessionId?:string;version?:number
}
export interface StationProfileInput {
  operationalStatus:StationOperationalStatus;applicationProfileId?:string;clientEnabled:boolean
  heartbeatIntervalSeconds:number;offlineGraceSeconds:number;version?:number
}
