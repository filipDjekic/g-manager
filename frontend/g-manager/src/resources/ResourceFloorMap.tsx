import { lazy, Suspense } from 'react'
import { Skeleton } from '../components/ui'
import { ReadonlyResourceMap } from './ReadonlyResourceMap'
import type { AreaView, FloorPlanGeometry, LocationFloorPlan } from '../types/resource.types'
import type { MapResource } from './floorPlanGeometry'

export interface ResourceMapProps {
  plan: LocationFloorPlan; geometry: FloorPlanGeometry; areas: AreaView[]; resources: MapResource[]; areaId: string; editing: boolean
  onFinish: () => void; onDetails: (id: string) => void; onSaved: (plan: LocationFloorPlan) => void
}
const ResourceFloorPlanEditor = lazy(()=>import('./ResourceFloorPlanEditor').then(module=>({default:module.ResourceFloorPlanEditor})))
export function ResourceFloorMap(props: ResourceMapProps) {
  return props.editing ? <Suspense fallback={<Skeleton lines={5} label="Učitavanje uređivača prostora"/>}><ResourceFloorPlanEditor {...props}/></Suspense> : <ReadonlyResourceMap {...props}/>
}
