import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { installApi, login } from './fixtures'
import type { AreaView, LocationFloorPlan, LocationView, ResourceAvailability, ResourceView } from '../src/types/resource.types'

const managementRoutes = ['/dashboard', '/management', '/equipment', '/catalog', '/employees', '/users',
  '/customers', '/resources', '/stations', '/gaming-sessions', '/reservations',
  '/calendar?view=week&date=2028-03-16', '/calendar?view=day&date=2028-03-16', '/calendar?view=month&date=2028-03-16',
  '/orders', '/waitlist', '/settings', '/reports', '/audit', '/profile', '/sessions', '/notification-preferences']
const accountRoutes = ['/profile', '/sessions', '/notification-preferences']
const routesByRole = {
  OWNER: managementRoutes,
  ADMIN: managementRoutes,
  EMPLOYEE: ['/dashboard', '/gaming-sessions', '/tools', '/calendar?view=week&date=2028-03-16',
    '/reservations', '/orders', '/waitlist', '/customers', '/resources', '/stations', '/catalog', '/reports', ...accountRoutes],
  CUSTOMER: ['/home', '/my-reservations', '/my-orders', '/catalog', '/resources', ...accountRoutes],
}

async function expectWorkspaceFits(page: Page, route: string) {
  await expect(page.locator('main.ui-page-layout'), route).toBeVisible()
  await expect(page.locator('main h1').first(), route).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Aplikacija trenutno nije dostupna.' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true)
}

for (const role of ['OWNER', 'ADMIN', 'EMPLOYEE', 'CUSTOMER'] as const) {
  test(`${role} existing pages share the polished shell without overflow or runtime errors`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const runtimeErrors: string[] = []
    page.on('pageerror', error => runtimeErrors.push(error.message))
    await installApi(page, role)
    await login(page, role)
    for (const route of routesByRole[role]) {
      await page.goto(route)
      await expectWorkspaceFits(page, route)
      if (route === routesByRole[role][0] || role === 'OWNER' && ['/catalog', '/reports', '/settings', '/resources', '/orders', '/calendar?view=week&date=2028-03-16'].includes(route)
        || role === 'CUSTOMER' && ['/my-orders', '/my-reservations'].includes(route)) {
        await page.screenshot({ path: testInfo.outputPath(`${role.toLowerCase()}-${route.split('?')[0].slice(1)}.png`), fullPage: true })
      }
    }
    await page.goto(routesByRole[role][0])
    await expectWorkspaceFits(page, routesByRole[role][0])
    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(accessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
    expect(runtimeErrors).toEqual([])
  })
}

for (const role of ['OWNER', 'CUSTOMER'] as const) {
  test(`${role} layout adapts from 320 to 1920 pixels including light compact mode`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'This matrix sets its own viewport and includes mobile widths.')
    test.setTimeout(180_000)
    await installApi(page, role)
    await login(page, role)
    const routes = role === 'OWNER' ? ['/dashboard', '/calendar?view=week&date=2028-03-16', '/reports', '/customers']
      : ['/home', '/my-reservations', '/my-orders', '/catalog']
    for (const width of [320, 390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(compact => localStorage.setItem('gmanager.ui-preferences.v1', JSON.stringify({
        theme: compact ? 'light' : 'dark', density: compact ? 'compact' : 'comfortable',
      })), width === 768)
      for (const route of routes) {
        await page.goto(route)
        await expectWorkspaceFits(page, route)
        if (route === '/customers') {
          const name = await page.getByRole('button', { name: 'Prikaži profil: CUSTOMER E2E' }).boundingBox()
          const row = await page.locator('.customers-table tbody tr').first().boundingBox()
          expect(name!.width).toBeGreaterThan(100)
          expect(row!.height).toBeLessThan(128)
        }
      }
      await page.screenshot({ path: testInfo.outputPath(`${role.toLowerCase()}-${width}.png`), fullPage: true })
      if (width === 768) {
        const accessibility = await new AxeBuilder({ page }).analyze()
        expect(accessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
      }
    }
    if (role === 'OWNER') {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto('/dashboard')
      const metrics = page.locator('.operations-metrics .ui-stat')
      await expect(metrics).toHaveCount(4)
      const rows = await metrics.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top))
      expect(new Set(rows).size).toBe(1)
      await page.getByRole('button', { name: 'Sažmi navigaciju', exact: true }).click()
      await expectWorkspaceFits(page, '/dashboard, collapsed sidebar')
    }
  })
}

test('mobile user dialog keeps its heading, scroll area, radio inputs and keyboard focus', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 640 })
  await installApi(page, 'OWNER')
  await login(page, 'OWNER')
  await page.goto('/users')
  const opener = page.getByRole('button', { name: '+ Novi korisnik', exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Novi korisnik', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Ime i prezime')).toBeFocused()
  await expect(dialog.getByRole('radio')).toHaveCount(2)
  const password = await dialog.getByLabel('Početna lozinka').boundingBox()
  const visibility = await dialog.getByRole('button', { name: 'Prikaži', exact: true }).boundingBox()
  expect(Math.abs(password!.y - visibility!.y)).toBeLessThan(1)
  const bounds = await dialog.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(641)
  await expect(dialog.getByRole('button', { name: 'Kreiraj korisnika' })).toBeInViewport()
  expect(await dialog.locator('.ui-dialog-body').evaluate(element => getComputedStyle(element).overflowY)).toBe('auto')
  await page.screenshot({ path: testInfo.outputPath('user-dialog.png'), fullPage: true })
  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

test('reduced motion, readable empty and error states retain recovery actions', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await installApi(page, 'CUSTOMER')
  await login(page, 'CUSTOMER')
  await expect(page.locator('.ui-empty').first()).toBeVisible()
  await page.getByRole('button', { name: /^Moj nalog:/ }).click()
  const animationDuration = await page.locator('.ui-overlay').evaluate(element => parseFloat(getComputedStyle(element).animationDuration))
  expect(animationDuration).toBeLessThanOrEqual(.001)
  await page.keyboard.press('Escape')
  await page.route('**/api/v1/catalog?**', async route => {
    await new Promise(resolve => setTimeout(resolve, 750))
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Ponuda trenutno nije dostupna.' }) })
  })
  await page.goto('/catalog')
  await expect(page.locator('.ui-skeleton').first()).toBeVisible()
  await expect(page.locator('.ui-error').first()).toBeVisible()
  await expect(page.locator('.ui-error').first().getByRole('button')).toBeVisible()
  await expectWorkspaceFits(page, '/catalog, error')
  await page.screenshot({ path: testInfo.outputPath('catalog-error.png'), fullPage: true })
})

test('customer checkout preserves the existing confirmation and visible success state', async ({ page }, testInfo) => {
  await installApi(page, 'CUSTOMER')
  await login(page, 'CUSTOMER')
  await page.goto('/my-orders')
  await page.getByRole('button', { name: 'Dodaj Test proizvod u korpu' }).click()
  if ((page.viewportSize()?.width ?? 1280) < 900) await page.getByRole('button', { name: /Korpa/ }).first().click()
  await page.getByRole('button', { name: 'Pošalji narudžbinu' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Potvrda narudžbine' })
  await expect(confirmation.getByRole('button', { name: 'Potvrdi slanje' })).toBeInViewport()
  await confirmation.getByRole('button', { name: 'Potvrdi slanje' }).click()
  await expect(page.getByText(/Narudžbina je uspešno poslata/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Stavke narudžbine' })).toBeVisible()
  await expectWorkspaceFits(page, '/my-orders, success')
  if ((page.viewportSize()?.width ?? 1280) <= 800) {
    const toastBottom = await page.locator('.ui-toasts').evaluate(element => parseFloat(getComputedStyle(element).bottom))
    expect(toastBottom).toBeGreaterThanOrEqual(72)
  }
  await page.screenshot({ path: testInfo.outputPath('checkout-success.png'), fullPage: true })
})

test('management analytics renders all charts with readable shared typography and table alternatives', async ({ page }, testInfo) => {
  await installApi(page, 'OWNER')
  await login(page, 'OWNER')
  await page.getByRole('tab', { name: 'Analitika', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Poslovni rezultati' })).toBeVisible()
  await expect(page.locator('.recharts-wrapper:visible')).toHaveCount(3)
  await expectWorkspaceFits(page, '/dashboard, analytics')
  await page.screenshot({ path: testInfo.outputPath('analytics.png'), fullPage: true })
  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
  await page.getByText('Tabelarni pregled', { exact: true }).first().click()
  await expect(page.getByRole('table', { name: 'Dnevni prihod, završene narudžbine i rezervacije' })).toBeVisible()
})

for (const role of ['OWNER', 'CUSTOMER'] as const) {
  test(`${role} populated resource map preserves zoom, keyboard selection and details`, async ({ page }, testInfo) => {
    await installApi(page, role)
    const location: LocationView = { id: 'location-1', code: 'ARENA', name: 'Arena Centar', address: 'Test adresa',
      timezone: 'Europe/Belgrade', active: true, version: 0 }
    const area: AreaView = { id: 'area-1', locationId: location.id, code: 'GAMING', name: 'Gaming zona',
      active: true, displayOrder: 0, mapWidth: 900, mapHeight: 600, version: 0 }
    const resources: ResourceView[] = [
      { id: 'pc-1', areaId: area.id, serviceId: 'service-1', code: 'PC-01', name: 'Arena PC 01', type: 'GAMING_PC',
        active: true, bookable: true, capacity: 1, displayOrder: 0, x: 90, y: 180, width: 160, height: 100, rotation: 0, version: 0 },
      { id: 'ps-1', areaId: area.id, serviceId: 'service-1', code: 'PS-01', name: 'PlayStation 01', type: 'PLAYSTATION',
        active: true, bookable: true, capacity: 2, displayOrder: 1, x: 440, y: 180, width: 160, height: 100, rotation: 0, version: 0 },
    ]
    const plan: LocationFloorPlan = { locationId: location.id, version: 0, geometry: {
      rooms: [{ id: 'room-1', label: 'Gaming zona', areaId: area.id, x: 0, y: 0, width: 900, height: 600 }], walls: [], doors: [],
    } }
    await page.route('**/api/v1/resources/**', route => {
      const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1', '')
      const availability: ResourceAvailability[] = resources.map(resource => ({ ...resource, status: 'AVAILABLE',
        start: url.searchParams.get('start') ?? '2028-03-16T10:00:00Z', end: url.searchParams.get('end') ?? '2028-03-16T11:00:00Z' }))
      const response = path === '/resources/locations' ? [location] : path === '/resources/locations/location-1/areas' ? [area]
        : path === '/resources/locations/location-1/floor-plan' ? plan : path === '/resources/areas/area-1' ? resources
          : path === '/resources/areas/area-1/availability' ? availability : undefined
      return response === undefined ? route.fallback() : route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) })
    })
    await login(page, role)
    await page.goto('/resources?view=map')
    const map = page.getByRole('group', { name: /^Mapa prostora\./ })
    await expect(map).toBeVisible()
    const initialView = await map.getAttribute('viewBox')
    await page.getByRole('button', { name: 'Uvećaj mapu', exact: true }).click()
    await expect(map).not.toHaveAttribute('viewBox', initialView!)
    await page.getByRole('button', { name: 'Cela mapa', exact: true }).click()
    await expect(map).toHaveAttribute('viewBox', initialView!)
    await expectWorkspaceFits(page, '/resources, populated map')
    await page.screenshot({ path: testInfo.outputPath(`${role.toLowerCase()}-resource-map.png`), fullPage: true })
    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(accessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
    await page.getByRole('button', { name: /^Arena PC 01 ·/ }).press('Enter')
    await expect(page.getByRole('dialog', { name: 'Arena PC 01', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(map).toBeVisible()
  })
}

test('route state cards stay centered and reflow with 200 percent text size', async ({ page }) => {
  await installApi(page, 'CUSTOMER')
  await login(page, 'CUSTOMER')
  for (const route of ['/unauthorized', '/visual-check-missing-page']) {
    await page.goto(route)
    await expectWorkspaceFits(page, route)
    const card = await page.locator('.screen-message > .ui-card').boundingBox()
    const viewport = page.viewportSize()!
    expect(Math.abs(card!.x + card!.width / 2 - viewport.width / 2)).toBeLessThan(1)
    expect(Math.abs(card!.y + card!.height / 2 - viewport.height / 2)).toBeLessThan(1)
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    await expectWorkspaceFits(page, `${route}, 200% text`)
  }
})
