import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { testArea, testGeometry, testMapResource } from '../test/resourceFixtures'
import { ReadonlyResourceMap } from './ReadonlyResourceMap'
import { FloorPlanGeometryView } from './FloorPlanGeometryView'

function map() {
  const onDetails = vi.fn()
  render(<ReadonlyResourceMap geometry={testGeometry} plan={{ locationId: 'loc-1', version: 1, geometry: testGeometry }} areas={[testArea]} resources={[testMapResource()]} areaId="area-1" editing={false} onDetails={onDetails} onFinish={vi.fn()} onSaved={vi.fn()} />)
  return onDetails
}
describe('accessible resource map interactions', () => {
  it('pans with all arrow keys, zooms with keyboard and buttons, and resets the view without changing data', async () => {
    const onDetails = map(), user = userEvent.setup(), svg = screen.getByRole('group', { name: /^Mapa prostora/ })
    const initial = svg.getAttribute('viewBox')!
    const width = () => Number(svg.getAttribute('viewBox')!.split(' ')[2])
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      fireEvent.keyDown(svg, { key }); expect(svg.getAttribute('viewBox')).not.toBeNull()
    }
    expect(svg.getAttribute('viewBox')).toBe(initial)
    fireEvent.keyDown(svg, { key: '+' }); expect(width()).toBeLessThan(Number(initial.split(' ')[2]))
    fireEvent.keyDown(svg, { key: '-' }); expect(width()).toBeCloseTo(Number(initial.split(' ')[2]))
    await user.click(screen.getByRole('button', { name: 'Uvećaj mapu' }))
    expect(width()).toBeLessThan(Number(initial.split(' ')[2]))
    await user.click(screen.getByRole('button', { name: 'Umanji mapu' }))
    await user.click(screen.getByRole('button', { name: 'Cela mapa' }))
    expect(svg.getAttribute('viewBox')).toBe(initial)
    fireEvent.keyDown(svg, { key: '=' }); fireEvent.keyDown(svg, { key: 'Home' })
    expect(svg.getAttribute('viewBox')).toBe(initial)
    const resource = screen.getByRole('button', { name: /Gaming PC 01.*Slobodan/ })
    fireEvent.keyDown(resource, { key: 'Enter' }); fireEvent.keyDown(resource, { key: ' ' }); fireEvent.click(resource)
    expect(onDetails).toHaveBeenCalledTimes(3)
    expect(onDetails).toHaveBeenLastCalledWith('pc-1')
  })

  it('treats a drag as panning and a stationary pointer as resource selection', () => {
    const onDetails = map(), svg = screen.getByRole('group', { name: /^Mapa prostora/ }), resource = screen.getByRole('button', { name: /Gaming PC 01.*Slobodan/ })
    Object.assign(svg, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn(), getScreenCTM: () => ({ a: 2 }) })
    const initial = svg.getAttribute('viewBox')
    fireEvent.pointerDown(resource, { pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 140, clientY: 120 })
    fireEvent.pointerUp(svg, { pointerId: 1 })
    fireEvent.click(resource, { detail: 1 })
    expect(svg.getAttribute('viewBox')).not.toBe(initial)
    expect(onDetails).not.toHaveBeenCalled()
    fireEvent.pointerDown(resource, { pointerId: 2, button: 0, isPrimary: true, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(svg, { pointerId: 2 })
    expect(onDetails).toHaveBeenCalledOnce()
    fireEvent.pointerDown(resource, { pointerId: 3, button: 0, isPrimary: true })
    fireEvent.pointerCancel(svg, { pointerId: 3 })
    expect(onDetails).toHaveBeenCalledOnce()
  })

  it('offers keyboard selection for rooms, walls, doors and resources while editing', () => {
    const onSelection = vi.fn(), onDetails = vi.fn(), onPointerDown = vi.fn()
    render(<svg><FloorPlanGeometryView geometry={testGeometry} areas={[testArea]} resources={[testMapResource(), testMapResource({ id: 'orphan', areaId: 'missing' })]} areaId="area-1" editing selection={{ kind: 'room', id: 'room-1' }} positions={{}} onSelection={onSelection} onPointerDown={onPointerDown} onDetails={onDetails} moved={{ current: false }} /></svg>)
    for (const [label, kind, id] of [
      ['Izaberi prostoriju PC room', 'room', 'room-1'], ['Izaberi zid 1', 'wall', 'wall-1'], ['Izaberi vrata ili prolaz 1', 'door', 'door-1'], ['Izaberi vrata ili prolaz 2', 'door', 'passage-1'],
    ]) {
      const element = screen.getByRole('button', { name: label })
      fireEvent.keyDown(element, { key: ' ' }); expect(onSelection).toHaveBeenLastCalledWith({ kind, id })
      fireEvent.pointerDown(element); expect(onPointerDown).toHaveBeenLastCalledWith(expect.anything(), { kind, id })
    }
    fireEvent.keyDown(screen.getByRole('button', { name: /Gaming PC 01/ }), { key: 'Enter' })
    expect(onSelection).toHaveBeenLastCalledWith({ kind: 'resource', id: 'pc-1' })
    expect(onDetails).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /orphan/ })).not.toBeInTheDocument()
  })
})
