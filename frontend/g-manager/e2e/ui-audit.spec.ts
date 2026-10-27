import { expect, test } from '@playwright/test'
import { installApi, login } from './fixtures'

const viewports = [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1600, height: 900 },
  { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]
const managementRoutes = ['/dashboard', '/catalog', '/employees', '/users', '/customers', '/resources', '/stations',
  '/gaming-sessions', '/reservations', '/calendar?view=week&date=2028-03-16', '/orders', '/waitlist', '/settings',
  '/reports', '/audit', '/profile', '/sessions', '/notification-preferences']

for (const viewport of viewports) {
  test(`all workspaces fit ${viewport.width}x${viewport.height} with expanded and collapsed navigation`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'The desktop matrix sets its own five viewport sizes.')
    test.setTimeout(180_000)
    await page.setViewportSize(viewport)
    const runtimeErrors: string[] = []
    page.on('pageerror', error => runtimeErrors.push(error.message))
    await installApi(page, 'OWNER')
    await login(page, 'OWNER')
    for (const collapsed of [false, true]) {
      if (collapsed) await page.getByRole('button', { name: 'Sažmi navigaciju', exact: true }).click()
      for (const route of managementRoutes) {
        await page.goto(route)
        await expect(page.locator('main h1').first()).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Aplikacija trenutno nije dostupna.' })).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}, collapsed=${collapsed}`).toBe(true)
        const content = await page.locator('main').boundingBox()
        const sidebar = await page.locator('.desktop-navigation').boundingBox()
        expect(content!.x).toBeGreaterThanOrEqual(sidebar!.width - 1)
        expect(content!.x + content!.width).toBeLessThanOrEqual(viewport.width + 1)
        if (!['/profile', '/sessions', '/notification-preferences'].includes(route)) {
          expect(content!.width).toBeGreaterThanOrEqual(viewport.width - sidebar!.width - 2)
        }
        if (route.startsWith('/calendar')) {
          await expect(page.getByRole('region', { name: 'Nedeljni vremenski raspored' })).toBeVisible()
          await page.screenshot({ path: testInfo.outputPath(`weekly-${collapsed ? 'collapsed' : 'expanded'}.png`), fullPage: false })
        }
      }
    }
    await installApi(page, 'CUSTOMER')
    await login(page, 'CUSTOMER')
    for (const route of ['/home', '/my-reservations', '/my-orders', '/catalog', '/resources']) {
      await page.goto(route)
      await expect(page.locator('main h1').first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true)
    }
    expect(runtimeErrors).toEqual([])
  })
}

test('weekly view preserves keyboard focus when opening and closing reservation details', async ({ page }) => {
  await installApi(page, 'OWNER'); await login(page, 'OWNER')
  await page.goto('/calendar?view=week&date=2028-03-16')
  const event = page.getByRole('button', { name: /Test usluga, CUSTOMER E2E/ })
  await event.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const close = dialog.getByRole('button', { name: 'Zatvori', exact: true })
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(event).toBeFocused()
})
