import { expect, test } from '@playwright/test'
import { installApi, login } from './fixtures'

function catalogItems(type: string) {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `${type.toLowerCase()}-${index}`, type,
    name: index % 2 ? 'Kratak naziv' : 'DugačakNazivBezRazmaka'.repeat(9),
    description: index % 2 ? null : 'VeomaDugačakOpisBezRazmaka'.repeat(30),
    price: index % 2 ? 120 : 999999999.99, durationMinutes: type === 'SERVICE' ? 60 : null,
    requiresResource: type === 'SERVICE', active: true, imageUrl: null, version: 0,
    deletedAt: null, deletedBy: null, deletionReason: null,
    createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:00:00Z',
  }))
}

for (const role of ['OWNER', 'ADMIN', 'EMPLOYEE', 'CUSTOMER'] as const) {
  test(`${role} compact offers fit mobile, tablet and desktop with long text`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const runtimeErrors: string[] = []
    page.on('pageerror', error => runtimeErrors.push(error.message))
    await installApi(page, role)
    await page.route('**/api/v1/gaming-billing/customers/*/time', route => route.fulfill({ json: { balanceSeconds: 7200, assignments: [] } }))
    await page.route('**/api/v1/catalog?*', route => {
      const type = new URL(route.request().url()).searchParams.get('type') ?? 'SERVICE'
      const content = catalogItems(type)
      return route.fulfill({ json: { content, page: 0, size: 10, totalElements: 8, totalPages: 1 } })
    })
    await page.route(/\/api\/v1\/catalog\/(service|product)-\d+$/, route => {
      const id = new URL(route.request().url()).pathname.split('/').pop()!
      return route.fulfill({ json: catalogItems(id.startsWith('service') ? 'SERVICE' : 'PRODUCT').find(item => item.id === id) })
    })
    await login(page, role)
    for (const width of testInfo.project.name.includes('mobile') ? [390] : [320, 390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      const dimensions: Record<string, { width: number; height: number }> = {}
      await page.evaluate(compact => localStorage.setItem('gmanager.ui-preferences.v1', JSON.stringify({
        theme: compact ? 'light' : 'dark', density: compact ? 'compact' : 'comfortable',
      })), width === 768)
      await page.goto('/catalog')
      for (const [type, tab] of [['SERVICE', 'Usluge'], ['PRODUCT', 'Proizvodi']] as const) {
        await page.getByRole('tab', { name: tab, exact: true }).click()
        const cards = page.locator('.gm-catalog-grid article')
        await expect(cards).toHaveCount(8)
        await expect(cards.first().locator('.gm-catalog-type-label')).toHaveText(type === 'SERVICE' ? 'Usluga' : 'Proizvod')
        const layout = await cards.evaluateAll(elements => {
          const rects = elements.map(element => element.getBoundingClientRect())
          return {
            columns: rects.filter(rect => Math.abs(rect.top - rects[0].top) < 1).length,
            dimensions: { width: rects[0].width, height: rects[0].height },
            equalSize: rects.every(rect => Math.abs(rect.width - rects[0].width) < 1 && Math.abs(rect.height - rects[0].height) < 1),
            fits: elements.every(element => element.scrollWidth <= element.clientWidth + 1),
            childrenFit: elements.every(element => Array.from(element.querySelectorAll('h2, p, .gm-catalog-price-row, a')).every(child => {
              const bounds = child.getBoundingClientRect(), card = element.getBoundingClientRect()
              return bounds.left >= card.left && bounds.right <= card.right
            })),
          }
        })
        expect(layout.equalSize).toBe(true)
        expect(layout.fits).toBe(true)
        expect(layout.childrenFit).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
        if (width <= 390) expect(layout.columns).toBe(1)
        if (width >= 768) expect(layout.columns).toBeGreaterThanOrEqual(2)
        if (width === 1920) expect(layout.columns).toBeGreaterThanOrEqual(4)
        expect(layout.dimensions.height).toBeLessThan(440)
        dimensions[type] = layout.dimensions
        if (width === 1280) {
          await cards.first().getByRole('button', { name: /^Akcije za/ }).click()
          if (role === 'OWNER' || role === 'ADMIN') {
            await expect(page.getByRole('menuitem', { name: 'Izmeni', exact: true })).toBeVisible()
            await expect(page.getByRole('menuitem', { name: 'Obriši', exact: true })).toBeVisible()
          } else {
            await expect(page.getByRole('menuitem', { name: 'Izmeni', exact: true })).toHaveCount(0)
          }
          await page.getByRole('menuitem', { name: 'Detalji', exact: true }).click()
          await expect(page.getByRole('dialog')).toBeVisible()
          await page.getByRole('button', { name: 'Zatvori', exact: true }).click()
          if (role === 'CUSTOMER') await expect(cards.first().getByRole('link', { name: type === 'SERVICE' ? 'Zakaži termin' : 'Dodaj u korpu' })).toBeVisible()
        }
        if (role === 'OWNER' || role === 'CUSTOMER') {
          if ([390, 768, 1920].includes(width)) {
            const path = testInfo.outputPath(`${role.toLowerCase()}-${type.toLowerCase()}-${width}.png`)
            if (testInfo.project.name.includes('mobile')) {
              // A full-page mobile screenshot resets Chromium's coarse pointer emulation.
              await cards.first().screenshot({ path })
            } else {
              await page.evaluate(() => window.scrollTo(0, 0))
              await page.screenshot({ path, fullPage: true })
            }
          }
        }
      }
      expect(Math.abs(dimensions.SERVICE.width - dimensions.PRODUCT.width)).toBeLessThan(1)
      expect(Math.abs(dimensions.SERVICE.height - dimensions.PRODUCT.height), JSON.stringify(dimensions)).toBeLessThan(1)
    }
    expect(runtimeErrors).toEqual([])
  })
}
