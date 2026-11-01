import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalendarContext, CalendarReservation } from '../types/reservation.types'
import { CalendarEvent, CalendarTimeline } from './CalendarTimeline'

const at = (hour: string) => `2028-03-16T${hour}:00Z`
const event = (patch: Partial<CalendarReservation> = {}): CalendarReservation => ({ id: 'reservation-1', resourceId: 'pc-1', resourceCode: 'PC-01', employeeId: 'employee-1', employeeName: 'Eva', customerName: 'Ada', serviceName: 'Game hour', startTime: at('10:00'), endTime: at('11:00'), status: 'CONFIRMED', version: 0, allowedActions: [], ...patch })
function context(): CalendarContext {
  return {
    timezone: 'Europe/Belgrade', serverTime: at('10:30'), rangeStart: at('00:00'), rangeEnd: '2028-03-17T00:00:00Z', occupiedStations: 1,
    locations: [{ id: 'loc-1', name: 'Arena', windows: [{ startTime: at('08:00'), endTime: at('12:00') }, { startTime: at('14:00'), endTime: at('18:00') }] }],
    areas: [{ id: 'area-1', locationId: 'loc-1', locationName: 'Arena', name: 'PC room', active: true, displayOrder: 0 }, { id: 'empty', locationId: 'loc-1', locationName: 'Arena', name: 'Closed room', active: false, displayOrder: 1 }],
    resources: [{ id: 'pc-1', code: 'PC-01', name: 'First PC', type: 'GAMING_PC', locationId: 'loc-1', locationName: 'Arena', areaId: 'area-1', areaName: 'PC room', canManage: true, currentRestriction: null },
      { id: 'pc-2', code: 'PS-02', name: 'Console', type: 'PLAYSTATION', locationId: 'loc-1', locationName: 'Arena', areaId: 'area-1', areaName: 'PC room', canManage: false, currentRestriction: 'STATION_CLIENT_OFFLINE' },
      { id: 'pc-3', code: 'SIM-03', name: 'Simulator', type: 'SIMULATOR', locationId: 'loc-1', locationName: 'Arena', areaId: 'area-1', areaName: 'PC room', canManage: true, currentRestriction: 'STATION_LOCK_PENDING' }],
    occupancy: [{ resourceId: 'pc-1', kind: 'RESERVATION', startTime: at('09:00'), endTime: at('10:00') }, { resourceId: 'pc-2', kind: 'SESSION', startTime: at('10:00'), endTime: at('12:00') }],
    employeeBlocks: [{ kind: 'TIME_OFF', startTime: at('08:00'), endTime: at('09:00') }, { kind: 'RESERVATION', startTime: at('15:00'), endTime: at('16:00') }, { kind: 'TIME_OFF', startTime: '2028-03-15T00:00:00Z', endTime: '2028-03-15T01:00:00Z' }],
  }
}
const mobile = (matches: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))

describe('resource calendar occupancy', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('separates overlapping reservations into lanes and retains occupancy hidden by reservation filters', () => {
    mobile(false)
    const onOpen = vi.fn(), data = context()
    render(<CalendarTimeline context={data} events={[event(), event({ id: 'overlap', customerName: 'Bea', startTime: at('10:30'), endTime: at('11:30'), readOnly: true }), event({ id: 'unassigned', resourceId: undefined, customerName: 'Cara' }), event({ id: 'old', customerName: 'Outside day', startTime: '2028-03-15T10:00:00Z', endTime: '2028-03-15T11:00:00Z' })]} now={Date.parse(data.serverTime)} onOpen={onOpen} />)
    const ada = screen.getByRole('button', { name: /PC-01.*Ada.*Game hour/ })
    const bea = screen.getByRole('button', { name: /PC-01.*Bea.*Game hour/ })
    expect(ada.style.top).not.toBe(bea.style.top)
    expect(bea).toHaveAccessibleName(/Samo pregled/)
    fireEvent.click(ada)
    expect(onOpen).toHaveBeenCalledWith('reservation-1', expect.anything())
    expect(screen.getByTitle(/^Rezervisano:/)).toBeVisible()
    expect(screen.getByText('Gaming sesija')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Outside day/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rezervacije bez dodeljenog resursa' })).toBeVisible()
    expect(screen.getAllByText('Trenutno nedostupan')).toHaveLength(2)
    expect(screen.getByText(/Zona neaktivna/)).toBeVisible()
    expect(screen.getAllByTitle('Nedostupno — van radnog vremena').length).toBeGreaterThan(0)
    const zone = screen.getByRole('button', { name: /Arena \/ PC room/ })
    fireEvent.click(zone)
    expect(zone).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /PC-01.*Ada/ })).not.toBeInTheDocument()
    fireEvent.click(zone)
    expect(screen.getByRole('button', { name: /PC-01.*Ada/ })).toBeVisible()
  })

  it('presents equivalent booking, read-only, blocked-time and closed-room information on mobile', () => {
    mobile(true)
    const onOpen = vi.fn(), data = context()
    render(<CalendarTimeline context={data} events={[event(), event({ id: 'unassigned', resourceId: undefined, resourceCode: undefined, resourceName: 'Unassigned', customerName: 'Cara', status: 'PENDING' })]} now={Date.parse(data.serverTime)} onOpen={onOpen} />)
    expect(screen.queryByRole('region', { name: /horizontalno/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Sada:/)).toBeVisible()
    expect(screen.getByText('Aktivna gaming sesija')).toBeVisible()
    expect(screen.getByText(/Gaming Client nije povezan/)).toBeVisible()
    expect(screen.getByText(/Zaključavanje stanice čeka/)).toBeVisible()
    expect(screen.getByText(/Zauzeće resursa:/)).toBeVisible()
    expect(screen.getByText('Nema prikazanih rezervacija ni aktivnih sesija.')).toBeVisible()
    const unassigned = screen.getByRole('heading', { name: 'Rezervacije bez dodeljenog resursa' }).parentElement!
    fireEvent.click(within(unassigned).getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith('unassigned', expect.anything())
    const zone = screen.getByRole('button', { name: /Arena \/ PC room/ })
    fireEvent.click(zone); expect(zone).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(zone); expect(screen.getByText('Aktivna gaming sesija')).toBeVisible()
  })

  it.each([false, true])('renders an honest empty scope without a current-time marker (mobile: %s)', isMobile => {
    mobile(isMobile)
    const data = { ...context(), locations: [], areas: [], resources: [], occupancy: [], employeeBlocks: [] }
    render(<CalendarTimeline context={data} events={[]} now={0} onOpen={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Nema zona i resursa')
    expect(screen.queryByText(/Sada:/)).not.toBeInTheDocument()
  })

  it('keeps overnight labels and undated resources readable when a location is closed', () => {
    mobile(true)
    const data = context()
    data.rangeEnd = '2028-03-17T06:00:00Z'
    data.locations[0].windows = []
    data.occupancy = []
    render(<CalendarTimeline context={data} events={[event({ startTime: at('23:30'), endTime: '2028-03-17T00:30:00Z' })]} now={0} onOpen={vi.fn()} />)
    expect(screen.getAllByText(/Lokal je zatvoren/)).toHaveLength(3)
    expect(screen.getByRole('button', { name: /Ada.*Game hour/ })).toBeVisible()
  })

  it('opens standalone agenda entries without exposing internal resource identifiers', () => {
    const onOpen = vi.fn()
    render(<CalendarEvent item={event({ resourceCode: undefined, resourceName: undefined, readOnly: true })} onOpen={onOpen} />)
    const entry = screen.getByRole('button')
    expect(entry).toHaveTextContent('Bez dodeljenog resursa')
    expect(entry).toHaveTextContent('Samo pregled')
    fireEvent.click(entry)
    expect(onOpen).toHaveBeenCalledWith('reservation-1', expect.anything())
  })
})
