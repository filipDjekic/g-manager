import { pageResponse } from './fixtures'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { addDays } from '../calendar/calendarModel'
import { businessLocalToInstant } from '../reservations/dateTime'

export const server = setupServer(
  http.get('/api/v1/gaming-billing/time-price', () => HttpResponse.json({ pricePerMinute: '2.50', version: 1 })),
  http.get('/api/v1/gaming-billing/customers/:id/time', ({ params }) => HttpResponse.json({ customerId: params.id, serverTime: new Date().toISOString(), balanceSeconds: 7200, activeSession: null, consumedSeconds: 0, assignments: [] })),
  http.get('/api/v1/gaming-billing/customers/:id/time/:kind', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/customers/:id/reservations', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/customers/:id/orders', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/customers/:id/crm/notes', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/gaming-sessions/me/history', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/gaming-sessions/customer/:id/history', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/gaming-operations/stations/:id/history', () => HttpResponse.json(pageResponse([], 20))),
  http.get('/api/v1/gaming-billing/customers/:id/history/:kind', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/gaming-billing/customers/:id/refundable-payments', () => HttpResponse.json([])),
  http.get('/api/v1/gaming-billing/report/:table', () => HttpResponse.json(pageResponse([], 20))),
  http.get('/api/v1/gaming-billing/tariffs/page', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/auth/security-events/page', () => HttpResponse.json(pageResponse([], 20))),
  http.get('/api/v1/time-off/summary', () => HttpResponse.json({ totalElements: 0 })),
  http.get('/api/v1/time-off/page', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/working-hours/exceptions/summary', () => HttpResponse.json({ totalElements: 0 })),
  http.get('/api/v1/working-hours/exceptions/page', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/working-hours/exceptions/calendar', () => HttpResponse.json([])),
  http.get('/api/v1/stations/applications/page', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/stations/application-profiles/page', () => HttpResponse.json(pageResponse([]))),
  http.get('/api/v1/gaming-billing/tariffs', () => HttpResponse.json([{ id: 'tariff-1', name: 'Standard test', minutes: 30, price: '100.00', currency: 'RSD', active: true, packageValidityDays: 0, version: 0 }])),
  http.get('/api/v1/gaming-billing/quote', ({ request }) => { const p = new URL(request.url).searchParams; return HttpResponse.json({ tariffId: 'tariff-1', tariffVersion: 0, tariffName: 'Standard test', minutes: Number(p.get('minutes')), gross: String(Number(p.get('minutes')) / 30 * 100), discount: '0.00', total: String(Number(p.get('minutes')) / 30 * 100), currency: 'RSD', rule: 'WHOLE_BLOCKS' }) }),
  http.get('/api/v1/gaming-billing/customers/:id', ({ params }) => HttpResponse.json({ customerId: params.id, balance: '0.00', currency: 'RSD', packages: [] })),
  http.get('/api/v1/gaming-billing/report', () => HttpResponse.json({ timeBalanceSeconds: 0, manualTime: {}, currency: 'RSD', totals: {}, archivedPackageSales: '0', outstandingDebt: '0', prepaidLiability: '0', recorded: [], sessions: [], productOrders: [] })),
  http.get('/api/v1/auth/csrf', () => HttpResponse.json({ token: 'synthetic-csrf-token' })),
  http.get('/api/v1/dashboard/today', () => HttpResponse.json({
    date: '2026-08-15', timezone: 'Europe/Belgrade', workingDayStart: null, workingDayEnd: null,
    appointments: [], gaps: [], unclaimedOrders: [], assignedOrders: [], attentionNotifications: [],
  })),
  http.get('/api/v1/reservations', () => HttpResponse.json({ content: [], page: 0, size: 10, totalElements: 0, totalPages: 0 })),
  http.get('/api/v1/resources/locations', () => HttpResponse.json([])),
  http.get('/api/v1/resources/reservation-filters', () => HttpResponse.json([])),
  http.get('/api/v1/resources/management-scope', () => HttpResponse.json({ allResources: true, resourceIds: [] })),
  http.get('/api/v1/resources/booking-options', () => HttpResponse.json({ resourceRequired: false, resources: [], variableDuration: false,
    defaultDurationMinutes: 60, minimumDurationMinutes: 60, maximumDurationMinutes: 60 })),
  http.get('/api/v1/reservations/calendar-context', ({ request }) => {
    const date = new URL(request.url).searchParams.get('date') ?? '2026-03-29'
    return HttpResponse.json({ timezone: 'Europe/Belgrade', serverTime: new Date().toISOString(),
      rangeStart: businessLocalToInstant(`${date}T00:00`), rangeEnd: businessLocalToInstant(`${addDays(date, 1)}T00:00`),
      locations: [], areas: [], resources: [], occupancy: [], employeeBlocks: [], occupiedStations: 0 })
  }),
  http.get('/api/v1/reservations/summary', () => HttpResponse.json({ todayReservations: 0, upcomingReservations: 0, cancelledTodayAppointments: 0, uniqueCustomers: 0, today: '2026-03-29', upcomingThrough: '2026-04-05', customersFrom: '2026-03-01', customersTo: '2026-03-31', timezone: 'Europe/Belgrade' })),
  http.get('/api/v1/reservations/me/summary', () => HttpResponse.json({ todayReservations: 0, upcomingReservations: 0, completedReservations: 0, serverTime: new Date().toISOString() })),
  http.get('/api/v1/customers/statistics', () => HttpResponse.json({ total: 1, active: 1, inactive: 0, newThisMonth: 1 })),
  http.get('/api/v1/catalog/statistics', () => HttpResponse.json({ totalServices: 1, totalProducts: 1, activeItems: 2, inactiveItems: 0 })),
  http.get('/api/v1/gaming-operations/board', () => HttpResponse.json({ serverTime: '2026-08-15T12:00:00Z', stations: [] })),
  http.get('/api/v1/gaming-sessions/stream', () => HttpResponse.json({}, { status: 503 })),
  http.get('/api/v1/gaming-sessions/customer/:id/active', () => HttpResponse.json([])),
  http.get('/api/v1/waitlist', () => HttpResponse.json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })),
  http.get('/api/v1/features/bootstrap', () => HttpResponse.json([
    { key: 'REPORTS', enabled: true, rolloutPercentage: 100, owner: 'Operations', reviewBy: '2027-02-01', overridden: false, overrideExpiresAt: null, version: null },
    { key: 'PWA_OFFLINE', enabled: true, rolloutPercentage: 100, owner: 'Platform', reviewBy: '2027-02-01', overridden: false, overrideExpiresAt: null, version: null },
    { key: 'AI_ASSISTANT', enabled: false, rolloutPercentage: 0, owner: 'Security', reviewBy: '2026-12-01', overridden: false, overrideExpiresAt: null, version: null },
  ])),
)
