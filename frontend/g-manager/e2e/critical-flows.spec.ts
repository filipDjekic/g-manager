import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

type Role = 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER'

const emptyPage = { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }

function user(role: Role) {
  return {
    id: `00000000-0000-0000-0000-${role.toLowerCase().padEnd(12, '0')}`,
    name: `${role} E2E`, email: `${role.toLowerCase()}@example.test`, role, active: true,
  }
}

async function installApi(page: Page, role: Role, aiEnabled = false) {
  let authenticated = false
  let orderCreated = false
  let reservationCreated = false
  let reservationStatus = 'PENDING'
  let orderTransitioned = false
  const savedViews: Array<{ id: string; resourceType: string; name: string; query: Record<string, string>; version: number }> = []

  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

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
      { key: 'WORKFLOWS', enabled: true, rolloutPercentage: 100, owner: 'Product', reviewBy: '2027-02-01', overridden: false, overrideExpiresAt: null, version: null },
      { key: 'PWA_OFFLINE', enabled: true, rolloutPercentage: 100, owner: 'Platform', reviewBy: '2027-02-01', overridden: false, overrideExpiresAt: null, version: null },
      { key: 'AI_ASSISTANT', enabled: aiEnabled, rolloutPercentage: aiEnabled ? 100 : 0, owner: 'Security', reviewBy: '2026-12-01', overridden: aiEnabled, overrideExpiresAt: null, version: null },
    ])
    if (path === '/features' && request.method() === 'GET') return json([
      { key: 'REPORTS', enabled: true, rolloutPercentage: 100, owner: 'Operations', reviewBy: '2027-02-01', overridden: false, overrideExpiresAt: null, version: null },
      { key: 'WORKFLOWS', enabled: true, rolloutPercentage: 100, owner: 'Product', reviewBy: '2027-02-01', overridden: false, overrideExpiresAt: null, version: null },
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
    if (path === '/working-hours/exceptions') return json([])
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
      pendingReservationsToMe: 1, confirmedTodayCount: 2,
      unclaimedOrdersCount: 3, myInProgressOrdersCount: 1,
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
    if (path === '/orders/me' && request.method() === 'GET') return json(orderCreated ? {
      ...emptyPage, totalElements: 1, totalPages: 1, content: [{
        id: 'order-1', customerId: user(role).id, handledBy: null, status: 'CREATED',
        totalPrice: 120, version: 0, createdAt: '2028-03-15T10:00:00Z',
        items: [{ productId: 'product-1', productName: 'Test proizvod', quantity: 1, unitPrice: 120 }],
      }],
    } : emptyPage)
    if (path === '/orders' && request.method() === 'POST') {
      orderCreated = true
      return json({ id: 'order-1' }, 201)
    }
    if (path === '/orders' && request.method() === 'GET') return json({
      ...emptyPage, totalElements: 1, totalPages: 1, content: [{
        id: 'order-2', customerId: 'customer-1', handledBy: null,
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
        status: 'PENDING', note: null, version: 0,
      }],
    } : emptyPage)
    if (path === '/reservations' && request.method() === 'POST') {
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
      reservationStatus = 'CANCELLED'
      return json({ id: 'reservation-1', status: reservationStatus, version: 1 })
    }
    if (path === '/users/employees') return json({ ...emptyPage, size: 100, content: [{
      ...user('EMPLOYEE'), id: 'employee-1', version: 0,
    }] })
    if (path === '/working-hours') return json([])
    return json(emptyPage)
  })
}

async function login(page: Page, role: Role) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(`${role.toLowerCase()}@example.test`)
  await page.getByLabel('Lozinka').fill('Synthetic-password-123!')
  await page.getByRole('button', { name: 'Prijavi se' }).click()
  await expect(page.getByText(`${role} E2E`)).toBeVisible()
}

async function revealResponsiveNavigation(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) <= 800) {
    await page.getByRole('button', { name: 'Meni' }).click()
    await expect(page.getByRole('dialog', { name: 'Navigacija' })).toBeVisible()
  }
}

for (const role of ['OWNER', 'ADMIN', 'EMPLOYEE', 'CUSTOMER'] as const) {
  test(`${role} auth and navigation smoke`, async ({ page }) => {
    await installApi(page, role)
    await login(page, role)
    await revealResponsiveNavigation(page)
    await expect(page.getByRole('link', { name: 'Profil' })).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
  })
}

test('customer creates an order and reservation with visible success states', async ({ page }) => {
  await installApi(page, 'CUSTOMER')
  await login(page, 'CUSTOMER')

  await page.goto('/my-orders')
  await page.locator('input[type="number"]').fill('1')
  await page.locator('section.panel').getByRole('button').click()
  await expect(page.getByRole('status')).toBeVisible()

  await page.goto('/my-reservations')
  await page.getByLabel('Usluga').selectOption('service-1')
  await page.getByLabel('Zaposleni').selectOption('employee-1')
  await page.locator('input[type="datetime-local"]').fill('2028-03-16T11:00')
  await page.getByRole('button', { name: /Po.*alji zahtev/ }).click()
  await expect(page.getByRole('status')).toBeVisible()
  await page.getByRole('button', { name: 'Detalji' }).click()
  const drawer = page.getByRole('dialog', { name: /Test usluga/ })
  await expect(drawer.getByText('CUSTOMER E2E')).toBeVisible()
  await expect(drawer.getByText('EMPLOYEE E2E')).toBeVisible()
  await expect(drawer.getByText('customer-1')).toHaveCount(0)
  await drawer.getByRole('button', { name: 'Otkaži' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Otkaži rezervaciju' })
  await confirmation.getByLabel('Razlog ili napomena (opciono)').fill('Promena plana')
  await confirmation.getByRole('button', { name: 'Otkaži', exact: true }).click()
  await expect(confirmation).not.toBeVisible()
})

test('employee performs an order status transition', async ({ page }) => {
  await installApi(page, 'EMPLOYEE')
  await login(page, 'EMPLOYEE')
  await page.goto('/orders')
  const takeOrder = page.getByRole('button', { name: 'Preuzmi' })
  await takeOrder.focus()
  await takeOrder.press('Enter')
  await expect(page.getByRole('article').getByText('IN_PROGRESS')).toBeVisible()
})

test('owner receives typed feature bootstrap and can inspect rollout metadata', async ({ page }) => {
  await installApi(page, 'OWNER')
  await login(page, 'OWNER')
  await page.goto('/features')
  await expect(page.getByRole('heading', { name: 'Feature flags' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'REPORTS' })).toBeVisible()
  await expect(page.getByText(/Owner: Operations/)).toBeVisible()
})

test('AI report pilot requires consent and exposes an accessible sourced fallback', async ({ page }) => {
  await installApi(page, 'OWNER', true)
  await login(page, 'OWNER')
  await page.goto('/reports')
  await expect(page.getByRole('button', { name: 'AI sažetak' })).toBeVisible()
  await page.getByRole('checkbox').focus()
  await page.getByRole('checkbox').press('Space')
  await page.getByRole('button', { name: 'AI sažetak' }).focus()
  await page.getByRole('button', { name: 'AI sažetak' }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Sažetak bez AI-a' })).toBeVisible()
  await expect(page.getByText(/Izveštaj orders, 42 redova/)).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
})

test('theme density and responsive navigation remain usable at configured viewport', async ({ page }) => {
  await installApi(page, 'CUSTOMER')
  await login(page, 'CUSTOMER')
  await page.getByLabel('Tema').selectOption('light')
  await page.getByLabel('Gustina prikaza').selectOption('compact')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact')

  const width = page.viewportSize()?.width ?? 1280
  if (width <= 800) {
    const menu = page.getByRole('button', { name: 'Meni' })
    await expect(menu).toBeVisible()
    await menu.click()
    await expect(page.getByRole('dialog', { name: 'Navigacija' })).toBeVisible()
    await page.getByRole('dialog', { name: 'Navigacija' }).getByRole('link', { name: 'Katalog' }).click()
  } else {
    await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Katalog' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Katalog' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})

test('all MVP routes have no serious accessibility findings', async ({ page }) => {
  test.setTimeout(90_000)
  await installApi(page, 'OWNER')
  await login(page, 'OWNER')
  const routes = ['/sessions', '/profile', '/catalog', '/employees', '/settings', '/dashboard',
    '/reservations', '/orders', '/users', '/audit']
  for (const route of routes) {
    await page.goto(route)
    await expect(page.locator('main h1')).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'), route).toEqual([])
  }
})

test('skip navigation, route focus, reduced motion and 200 percent zoom layout work', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 320, height: 640 })
  await installApi(page, 'CUSTOMER')
  await login(page, 'CUSTOMER')
  await page.goto('/catalog')
  await expect(page.locator('main h1')).toBeFocused()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Preskoči na glavni sadržaj' })
  await expect(skipLink).toBeVisible()
  await skipLink.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
})

test('deep link, refresh, back navigation and saved views preserve list context', async ({ page }) => {
  await installApi(page, 'OWNER')
  await login(page, 'OWNER')
  await page.goto('/orders?status=READY&page=2&sort=totalPrice&direction=DESC')
  await expect(page.getByLabel('Status')).toHaveValue('READY')
  await expect(page.getByText('Strana 3 od 1')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Status')).toHaveValue('READY')
  page.once('dialog', (dialog) => dialog.accept('Spremne narudžbine'))
  await page.getByRole('button', { name: 'Sačuvaj prikaz' }).click()
  await expect(page.getByRole('combobox', { name: /Sačuvani prikaz/ })).toContainText('Spremne narudžbine')
  await page.goto('/catalog')
  await page.goBack()
  await expect(page).toHaveURL(/status=READY/)
  await expect(page.getByLabel('Status')).toHaveValue('READY')
})
