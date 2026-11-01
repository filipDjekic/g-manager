import { describe, expect, it } from 'vitest'
import { completeGeometry, localPosition, mapBounds, positionOf, resourceRect } from './floorPlanGeometry'
import { testArea, testGeometry, testMapResource, testResource } from '../test/resourceFixtures'

describe('floor plan coordinate and persistence contract', () => {
  it('adds deterministic rooms without mutating saved geometry or existing coordinates', () => {
    const saved = structuredClone(testGeometry)
    const areas = [testArea, ...[2, 3, 4].map(n => ({ ...testArea, id: `area-${n}`, name: `Room ${n}` }))]
    const large = testResource({ areaId: 'area-2', x: 1100, y: 800 })
    const result = completeGeometry(saved, areas, [large])
    expect(saved).toEqual(testGeometry)
    expect(result.rooms[0]).toEqual(saved.rooms[0])
    expect(result.rooms.map(room => room.areaId)).toEqual(areas.map(area => area.id))
    expect(result.rooms[1].width).toBeGreaterThan(large.x + large.width)
    expect(result.rooms[1].height).toBeGreaterThan(large.y + large.height)
    expect(result.rooms[3].y).toBeGreaterThan(result.rooms[1].y + result.rooms[1].height)
    expect(completeGeometry(result, areas, [large])).toEqual(result)
    expect(result.walls[0]).not.toBe(saved.walls[0])
    expect(result.doors[0]).not.toBe(saved.doors[0])
  })

  it('round-trips nonuniform room scaling and clamps positions outside the room', () => {
    const resource = testResource({ rotation: 90 })
    const room = { ...testGeometry.rooms[0], width: 500, height: 1400 }
    const rect = resourceRect(resource, testArea, room)
    expect(rect).toMatchObject({ x: 70, y: 120, width: 70, height: 180, scaleX: 0.5, scaleY: 2, rotation: 90 })
    expect(localPosition(rect.x, rect.y, testArea, room)).toEqual({ x: resource.x, y: resource.y })
    expect(localPosition(-100, -100, testArea, room)).toEqual({ x: 0, y: 0 })
    expect(positionOf(resource)).toEqual({ id: resource.id, version: 4, x: 20, y: 30, width: 140, height: 90, rotation: 90 })
  })

  it('fits rotated resources and includes walls only in the complete-location view', () => {
    const resource = testMapResource({ x: 950, y: 650, rotation: 45 })
    const geometry = { ...testGeometry, walls: [...testGeometry.walls, { id: 'outside', x1: -400, y1: -300, x2: 1500, y2: 900, thickness: 4 }] }
    const all = mapBounds(geometry, [testArea], [resource], { [resource.id]: { ...positionOf(resource.details!), width: 300 } }, '')
    const area = mapBounds(geometry, [testArea], [resource], {}, testArea.id)
    expect(all.x).toBe(-450)
    expect(all.y).toBe(-350)
    expect(all.width).toBeGreaterThan(area.width)
    expect(area.width).toBeGreaterThan(testArea.mapWidth)
    expect(mapBounds({ rooms: [], walls: [], doors: [] }, [], [resource], {}, '')).toEqual({ x: 0, y: 0, width: 1000, height: 650 })
    expect(mapBounds(testGeometry, [], [resource], {}, testArea.id)).toMatchObject({ x: 10, y: 10 })
  })
})
