import { expect, test } from '@playwright/test'

test('production shell is installable, works offline and never caches API responses', async ({ page, context }) => {
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await page.goto('/login')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  expect(await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return registration.scope
  })).toBe('http://127.0.0.1:4174/')
  // The first load installs the worker; this controlled online reload populates
  // the exact hashed assets used by the current release before testing offline.
  await page.reload()
  await expect(page.getByRole('heading', { name: /Prijava/i })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  const apiEntries = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) =>
    (await caches.open(name)).keys()))).flat().filter((request) => new URL(request.url).pathname.startsWith('/api/')).length)
  expect(apiEntries).toBe(0)

  await context.setOffline(true)
  await page.reload()
  await expect(page).toHaveTitle(/G-Manager/)
  await expect(page.getByRole('heading', { name: /Prijava/i })).toBeVisible()
})
