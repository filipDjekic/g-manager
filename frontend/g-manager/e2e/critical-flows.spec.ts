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

async function installApi(page: Page, role: Role) {
  let authenticated = false
  let orderCreated = false
  let reservationCreated = false
  let orderTransitioned = false

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
    if (path === '/auth/sessions' || path === '/auth/security-events') return json([])
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

for (const role of ['OWNER', 'ADMIN', 'EMPLOYEE', 'CUSTOMER'] as const) {
  test(`${role} auth and navigation smoke`, async ({ page }) => {
    await installApi(page, role)
    await login(page, role)
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
