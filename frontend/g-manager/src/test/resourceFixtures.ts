import type { AreaView, FloorPlanGeometry, LocationView, ResourceView } from '../types/resource.types'
import type { MapResource } from '../resources/floorPlanGeometry'

export const testLocation: LocationView = { id: 'loc-1', code: 'ARENA', name: 'Arena', address: 'Test street 1', timezone: 'Europe/Belgrade', active: true, version: 3 }
export const testArea: AreaView = { id: 'area-1', locationId: testLocation.id, code: 'PC', name: 'PC room', active: true, displayOrder: 0, mapWidth: 1000, mapHeight: 700, version: 2 }
export function testResource(patch: Partial<ResourceView> = {}): ResourceView {
  return { id: 'pc-1', areaId: testArea.id, serviceId: 'service-1', code: 'PC-01', name: 'Gaming PC 01', type: 'GAMING_PC', description: 'Test resource', active: true, bookable: true, capacity: 1, displayOrder: 0, x: 20, y: 30, width: 140, height: 90, rotation: 0, version: 4, ...patch }
}
export function testMapResource(patch: Partial<ResourceView> = {}, status: MapResource['status'] = 'AVAILABLE'): MapResource {
  const details = testResource(patch)
  return { ...details, details, status, areaName: testArea.name, start: '2028-03-16T10:00:00Z', end: '2028-03-16T11:00:00Z' }
}
export const testGeometry: FloorPlanGeometry = {
  rooms: [{ id: 'room-1', label: testArea.name, areaId: testArea.id, x: 60, y: 60, width: 1000, height: 700 }],
  walls: [{ id: 'wall-1', x1: 60, y1: 60, x2: 1060, y2: 60, thickness: 8 }],
  doors: [{ id: 'door-1', kind: 'DOOR', x1: 60, y1: 120, x2: 60, y2: 180 }, { id: 'passage-1', kind: 'PASSAGE', x1: 60, y1: 200, x2: 60, y2: 260 }],
}
