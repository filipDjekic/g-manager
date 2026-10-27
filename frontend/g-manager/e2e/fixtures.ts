import { expect, type Page, type Route } from '@playwright/test'
import { addDays } from '../src/calendar/calendarModel'
import { businessLocalToInstant } from '../src/reservations/dateTime'

type Role = 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER'

const emptyPage = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }

function user(role: Role) {
  return {
    id: `00000000-0000-0000-0000-${role.toLowerCase().padEnd(12, '0')}`,
    name: `${role} E2E`, email: `${role.toLowerCase()}@example.test`, role, active: true,
  }
}

export async function installApi(page: Page, role: Role, aiEnabled = false, reservationConflictOnce = false) {
  let authenticated = false
  let orderCreated = false
  let reservationCreated = false
  let reservationStatus = 'PENDING'
  let reservationConflictReturned = false
  let orderTransitioned = false
  let gamingSessionActive = false
  const savedViews: Array<{ id: string; resourceType: string; name: string; query: Record<string, string>; version: number }> = []

  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/resources/reservation-filters' || path === '/resources/catalog-services/service-1') return json([])
    if (path === '/resources/management-scope') return json({ allResources: role === 'OWNER' || role === 'ADMIN', resourceIds: ['station-1'] })
    if (path === '/resources/booking-options') return json({ resourceRequired: false, resources: [], variableDuration: false, defaultDurationMinutes: 60, minimumDurationMinutes: 60, maximumDurationMinutes: 60 })
    if (path === '/orders/statistics') return json({ total: 1, completed: 0, inProgress: 0, cancelled: 0, from: null, to: null, timeZone: 'Europe/Belgrade' })
    if (path === '/catalog/statistics') return json({ serviceCount: 1, activeServiceCount: 1, productCount: 1, inactiveCount: 0, administrative: role !== 'CUSTOMER', maxImageBytes: 5242880 })
    if (path === '/customers/statistics') return json({ total: 1, active: 1, inactive: 0, newThisMonth: 1 })
    if (path === '/reservations/me/summary' || path === '/reservations/summary') return json({ serverTime: new Date().toISOString(), todayReservations: 0, upcomingReservations: 1, completedReservations: 0, cancelledTodayAppointments: 0, uniqueCustomers: 1, today: '2028-03-16', upcomingThrough: '2028-03-23', customersFrom: '2028-03-01', customersTo: '2028-03-31', timezone: 'Europe/Belgrade' })
    if (path === '/reservations/calendar-context') {
      const date = url.searchParams.get('date') ?? '2028-03-16'
      return json({ timezone: 'Europe/Belgrade', serverTime: new Date().toISOString(), rangeStart: businessLocalToInstant(`${date}T00:00`), rangeEnd: businessLocalToInstant(`${addDays(date, 1)}T00:00`),
        occupiedStations: 0, locations: [{ id: 'location-1', name: 'Arena Centar', windows: [{ startTime: `${date}T07:00:00Z`, endTime: `${date}T21:00:00Z` }] }], areas: [], resources: [], occupancy: [], employeeBlocks: [] })
    }
    if (path === '/notifications/preferences') return json([{ type: 'SECURITY_SESSION_STARTED', mandatory: true, inAppEnabled: true, emailEnabled: true }])
    if (path === '/notifications') return json({ notifications: [], unreadCount: 0 })
    if (path === '/notifications/stream') return route.fulfill({ status: 503, body: '' })
    if (path === '/auth/logout') { authenticated = false; return route.fulfill({ status: 204 }) }
    if (path === '/notifications/unread-count') return json({ count: 0 })
    if (path === '/waitlist/statistics') return json({ active: 0, waiting: 0, offered: 0, accepted: 0, cancelled: 0, expiredOffers: 0, periodStart: '2028-03-01T00:00:00Z', periodEnd: '2028-04-01T00:00:00Z', serverTime: new Date().toISOString() })
    if (path === '/audit-events/statistics') return json({ total: 0, created: 0, updated: 0, removed: 0, creationActions: [], updateActions: [], removalActions: [] })
    if (path === '/users/statistics') return json({ total: 4, active: 4, inactive: 0, byRole: { OWNER: 1, ADMIN: 1, EMPLOYEE: 1, CUSTOMER: 1 } })
    if (path === '/auth/refresh') {
      return authenticated
        ? json({ token: 'synthetic-e2e-token', expiresAt: '2030-01-01T00:00:00Z', user: user(role) })
        : json({ status: 401, message: 'No session' }, 401)
    }
    if (path === '/auth/login') {
      authenticated = true
      return json({ token: 'synthetic-e2e-token', expiresAt: '2030-01-01T00:00:00Z', user: user(role) })
    }
    if (path === '/features/bootstrap') return json([
      { key: 'REPORTS', enabled: true, rolloutPercentage: 100, owner: 'Operations', reviewBy: '2027-02-01', overridden: false, overrideExpiresAt: null, version: null },
      { key: 'PWA_OFFLINE', enabled: true, rolloutPercentage: 100, owner: 'Platform', reviewBy: '2027-02-01', overridden: false, overrideExpiresAt: null, version: null },
      { key: 'AI_ASSISTANT', enabled: aiEnabled, rolloutPercentage: aiEnabled ? 100 : 0, owner: 'Security', reviewBy: '2026-12-01', overridden: aiEnabled, overrideExpiresAt: null, version: null },
    ])
    if (path === '/auth/sessions' || path === '/auth/security-events') return json([])
    if (path === '/saved-views' && request.method() === 'GET') {
      const resourceType = url.searchParams.get('resourceType')
      return json(savedViews.filter((view) => view.resourceType === resourceType))
    }
    if (path === '/saved-views' && request.method() === 'POST') {
      const input = request.postDataJSON() as { resourceType: string; name: string; query: Record<string, string> }
      const view = { id: `view-${savedViews.length + 1}`, ...input, version: 0 }
      savedViews.push(view); return json(view, 201)
    }
    if (path === '/users/me') return json(user(role))
    if (path === '/resources/locations' || path === '/stations' || path === '/stations/applications' || path === '/stations/application-profiles') return json([])
    if (path === '/stations/client-package') return json({status:'DEVELOPMENT',version:'0.1.0-dev',downloadUrl:null,sha256:null})
    if (path === '/gaming-sessions/me' || path.startsWith('/gaming-sessions/customer/') || path === '/waitlist/me') return json([])
    if (path === '/waitlist') return json(emptyPage)
    if (path === '/working-hours/exceptions' || path === '/time-off') return json([])
    if (path === '/reports/definitions') return json([{ key: 'orders', label: 'Orders', metricDefinition: 'Created in range', formats: ['CSV'] }])
    if (path === '/reports' && request.method() === 'GET') return json([{ id: 'report-1', definitionKey: 'orders', format: 'CSV', status: 'COMPLETED', progress: 100, rowCount: 42, documentId: 'document-1', errorMessage: null, snapshotAt: '2028-03-15T10:00:00Z', expiresAt: '2028-03-16T10:00:00Z', version: 1 }])
    if (path === '/reports/schedules') return json([])
    if (path === '/ai/report-summaries/report-1') return json({ usageId: 'usage-1', aiGenerated: false, summary: 'Deterministic report metadata summary.', limitations: 'Provider unavailable; source report remains authoritative.', sources: [{ reportId: 'report-1', definition: 'orders', rowCount: 42, snapshotAt: '2028-03-15T10:00:00Z' }], promptVersion: 'report-summary-v1', outputVersion: 'report-summary-response-v1' })
    if (path === '/ai/usage/usage-1/feedback') return json(null, 204)
    if (path === '/dashboard/summary') return json({
      totalRevenueCompleted: 1200, completedOrdersCount: 2,
      reservationsByStatus: { PENDING: 1, CONFIRMED: 2, REJECTED: 0, CANCELLED: 0, COMPLETED: 3 },
    })
    if (path === '/dashboard/today') return json({
      date: '2028-03-16', timezone: 'Europe/Belgrade',
      workingDayStart: '2028-03-16T08:00:00Z', workingDayEnd: '2028-03-16T16:00:00Z',
      appointments: [{ id: 'reservation-1', customerName: 'CUSTOMER E2E', serviceName: 'Test usluga',
        startTime: '2028-03-16T10:00:00Z', endTime: '2028-03-16T11:00:00Z', status: reservationStatus,
        version: 0, allowedActions: reservationStatus === 'PENDING' ? ['CONFIRMED', 'REJECTED', 'CANCELLED'] : [] }],
      gaps: [{ startTime: '2028-03-16T08:00:00Z', endTime: '2028-03-16T10:00:00Z' }],
      unclaimedOrders: orderTransitioned ? [] : [{ id: 'order-2', status: 'CREATED', totalPrice: 120,
        createdAt: '2028-03-15T10:00:00Z', version: 0, allowedActions: ['IN_PROGRESS'] }],
      assignedOrders: [], attentionNotifications: [{ id: 'notification-1', priority: 'HIGH',
        title: 'Novi termin', body: 'Termin zahteva potvrdu', createdAt: '2028-03-16T09:00:00Z' }],
    })
    if (path === '/dashboard/attention') return json({
      date: '2028-03-16', timezone: 'Europe/Belgrade', workloadThresholdPercent: 80,
      items: [{ key: 'pending-today', label: 'Rezervacije na čekanju', detail: 'Početak termina je danas',
        count: 1, severity: 'warning', url: '/reservations?status=PENDING&from=2028-03-16&to=2028-03-16' }],
    })
    if (path === '/dashboard/widget-preferences') return json([])
    if (path === '/dashboard/trends') return json({
      from: '2028-03-01', to: '2028-03-31', previousFrom: '2028-02-01', previousTo: '2028-02-29',
      timezone: 'Europe/Belgrade', grain: 'DAY',
      revenue: { current: 1200, previous: 900, absoluteChange: 300, percentChange: 33.33 },
      completedOrders: { current: 2, previous: 1, absoluteChange: 1, percentChange: 100 },
      reservations: { current: 6, previous: 4, absoluteChange: 2, percentChange: 50 },
      reservationsByStatus: { PENDING: 1, CONFIRMED: 2, REJECTED: 0, CANCELLED: 0, COMPLETED: 3 },
      buckets: [],
    })
    if (path === '/dashboard/workload') return json({
      from: '2028-03-01', to: '2028-03-31', timezone: 'Europe/Belgrade',
      capacityDefinition: 'Podešeno radno vreme', employees: [],
    })
    if (path === '/catalog') {
      const service = url.searchParams.get('type') === 'SERVICE'
      return json({ ...emptyPage, size: 100, content: [service ? {
        id: 'service-1', name: 'Test usluga', description: 'Synthetic', type: 'SERVICE',
        price: 500, durationMinutes: 60, active: true, version: 0,
      } : {
        id: 'product-1', name: 'Test proizvod', description: 'Synthetic', type: 'PRODUCT',
        price: 120, durationMinutes: null, active: true, version: 0,
      }] })
    }
    if (path === '/catalog/product-1' || path === '/catalog/service-1') return json({ id: path.endsWith('service-1') ? 'service-1' : 'product-1', name: path.endsWith('service-1') ? 'Test usluga' : 'Test proizvod', type: path.endsWith('service-1') ? 'SERVICE' : 'PRODUCT', price: 120, durationMinutes: 60, active: true, version: 0, imageUrl: null })
    if (path === '/orders/order-1' || path === '/orders/me/order-1') return json({ id: 'order-1', customerId: user(role).id, status: 'CREATED', totalPrice: 120, version: 0, createdAt: '2028-03-15T10:00:00Z', allowedActions: ['CANCELLED'], items: [{ productId: 'product-1', productName: 'Test proizvod', quantity: 1, unitPrice: 120, lineTotal: 120 }] })
    if (path === '/orders/me' && request.method() === 'GET') return json(orderCreated ? {
      ...emptyPage, totalElements: 1, totalPages: 1, content: [{
        id: 'order-1', customerId: user(role).id, handledBy: null, status: 'CREATED',
        totalPrice: 120, version: 0, createdAt: '2028-03-15T10:00:00Z',
        items: [{ productId: 'product-1', productName: 'Test proizvod', quantity: 1, unitPrice: 120 }],
      }],
    } : emptyPage)
    if (path === '/orders' && request.method() === 'POST') {
      orderCreated = true
      return json({ id: 'order-1', totalPrice: 120, status:'CREATED', version:0, items:[] }, 201)
    }
    if (path === '/orders' && request.method() === 'GET') return json({
      ...emptyPage, totalElements: 1, totalPages: 1, content: [{
        id: 'order-2', customerId: 'customer-1', customerName: 'CUSTOMER E2E', handledBy: orderTransitioned ? user(role).id : null,
        status: orderTransitioned ? 'IN_PROGRESS' : 'CREATED', totalPrice: 120,
        version: orderTransitioned ? 1 : 0, createdAt: '2028-03-15T10:00:00Z', items: [],
      }],
    })
    if (/^\/orders\/[^/]+\/status$/.test(path)) {
      orderTransitioned = true
      return json({ id: 'order-2', status: 'IN_PROGRESS', version: 1 })
    }
    if (path === '/reservations/me') return json(reservationCreated ? {
      ...emptyPage, totalElements: 1, totalPages: 1, content: [{
        id: 'reservation-1', customerId: user(role).id, employeeId: 'employee-1',
        serviceId: 'service-1', startTime: '2028-03-16T10:00:00Z', endTime: '2028-03-16T11:00:00Z',
        status: reservationStatus, note: null, version: 0, serviceName: 'Test usluga', employeeName: 'EMPLOYEE E2E', allowedActions: reservationStatus === 'PENDING' ? ['CANCELLED'] : [],
      }],
    } : emptyPage)
    if (path === '/availability' || path === '/availability/overview') return json({
      timezone: 'Europe/Belgrade', serviceId: 'service-1', serviceName: 'Test usluga',
      durationMinutes: 60, slotIncrementMinutes: 15,
      from: url.searchParams.get('from'), to: url.searchParams.get('to'),
      employees: [{
        employeeId: 'employee-1', employeeName: 'EMPLOYEE E2E',
        slots: [{ startTime: '2028-03-16T10:00:00Z', endTime: '2028-03-16T11:00:00Z' }],
      }],
    })
    if (path === '/reservations/calendar') {
      const calendarDay = url.searchParams.get('from') ?? '2028-03-16'
      return json([{
      id: 'reservation-1', employeeId: 'employee-1', employeeName: 'EMPLOYEE E2E',
      customerName: 'CUSTOMER E2E', serviceName: 'Test usluga',
      startTime: `${calendarDay}T10:00:00Z`, endTime: `${calendarDay}T11:00:00Z`, status: 'CONFIRMED',
      }])
    }
    if (path === '/reservations' && request.method() === 'POST') {
      if (reservationConflictOnce && !reservationConflictReturned) {
        reservationConflictReturned = true
        return json({ status: 409, message: 'Employee unavailable' }, 409)
      }
      reservationCreated = true
      return json({ id: 'reservation-1' }, 201)
    }
    if (path === '/reservations/reservation-1' && request.method() === 'GET') return json({
      id: 'reservation-1', customerName: `${role} E2E`, customerContact: role === 'OWNER' || role === 'ADMIN' ? `${role.toLowerCase()}@example.test` : null,
      employeeName: 'EMPLOYEE E2E', serviceName: 'Test usluga', durationMinutes: 60,
      startTime: '2028-03-16T10:00:00Z', endTime: '2028-03-16T11:00:00Z', status: reservationStatus,
      note: null, createdAt: '2028-03-15T10:00:00Z', updatedAt: '2028-03-15T10:00:00Z', version: 0,
      allowedActions: reservationStatus === 'PENDING' ? ['CANCELLED'] : [], history: [],
    })
    if (path === '/reservations/reservation-1/status' && request.method() === 'PATCH') {
      reservationStatus = (request.postDataJSON() as { status: string }).status
      return json({ id: 'reservation-1', status: reservationStatus, version: 1 })
    }
    if (path === '/users/employees') return json({ ...emptyPage, size: 100, content: [{
      ...user('EMPLOYEE'), id: 'employee-1', version: 0,
    }] })
    if (path === '/gaming-sessions/stream') return route.fulfill({ status: 503, body: '' })
    if (path === '/gaming-operations/board') return json({ serverTime: '2028-03-16T10:00:00Z', stations: [{
      resourceId: 'station-1', resourceCode: 'PC-01', resourceName: 'Arena PC 01', locationId: 'location-1',
      status: gamingSessionActive ? 'ACTIVE' : 'AVAILABLE', clientEnabled: false, staleHeartbeat: false, enforcementStatus: 'LOCKED',
      applicationProfileName: 'Arena Standard', locationName: 'Arena Centar', areaName: 'Gaming zona',
      sessionId: gamingSessionActive ? 'gaming-session-1' : null, customerId: gamingSessionActive ? 'customer-1' : null,
      customerDisplayName: gamingSessionActive ? 'CUSTOMER E2E' : null,
      startedAt: gamingSessionActive ? '2028-03-16T10:00:00Z' : null,
      endsAt: gamingSessionActive ? '2028-03-16T12:00:00Z' : null,
      remainingSeconds: gamingSessionActive ? 7200 : 0, sessionVersion: gamingSessionActive ? 1 : null,
      allowedActions: gamingSessionActive ? ['EXTEND', 'TERMINATE'] : ['START'],
    }] })
    if (path === '/customers' && request.method() === 'GET') return json({ ...emptyPage, size: 8,
      totalElements: 1, totalPages: 1, content: [{ id: 'customer-1', name: 'CUSTOMER E2E',
        email: 'customer@example.test', active: true, registeredAt: '2028-01-01T10:00:00Z',
        reservationCount: 0, completedAppointmentCount: 0, orderCount: 0, completedOrderCount: 0,
        completedOrderRevenue: 0, lastActivityAt: null, version: 0 }] })
    if (path === '/gaming-sessions' && request.method() === 'POST') {
      gamingSessionActive = true
      return json({ id: 'gaming-session-1', status: 'ACTIVE', version: 1 }, 201)
    }
    if (path === '/working-hours') return json([])
    return json(emptyPage)
  })
}

export async function login(page: Page, role: Role) {
  await page.goto('/login')
  await page.getByLabel('Email adresa').fill(`${role.toLowerCase()}@example.test`)
  await page.getByLabel('Lozinka').fill('Synthetic-password-123!')
  await page.getByRole('button', { name: 'Prijavi se' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

export async function revealResponsiveNavigation(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) <= 800) {
    await page.getByRole('button', { name: 'Meni', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Navigacija' })).toBeVisible()
  }
}

