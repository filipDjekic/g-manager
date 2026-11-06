import { expect, test } from '@playwright/test'
import { installApi, login } from './fixtures'

for (const role of ['OWNER', 'ADMIN', 'EMPLOYEE'] as const) {
  test(`${role} records a priced time purchase on desktop and mobile`, async ({ page }, testInfo) => {
    await installApi(page, role)
    let balanceSeconds = 7200
    const payments: { minutes: number; priceVersion: number; method: 'CASH' | 'EXTERNAL_POS'; reference?: string }[] = []
    await page.route('**/api/v1/gaming-billing/time-price', route => route.fulfill({ json: { pricePerMinute: '2.50', version: 1 } }))
    await page.route('**/api/v1/gaming-billing/customers/*/time', route => route.fulfill({ json: { balanceSeconds, assignments: [] } }))
    await page.route('**/api/v1/customers?*', route => route.fulfill({ json: { content: [{ id: 'customer-time', name: 'Ada Gaming', email: 'ada@example.test', active: true }], page: 0, size: 8, totalElements: 1, totalPages: 1 } }))
    await page.route('**/api/v1/gaming-billing/customers/*/time-grants', async route => {
      const body = route.request().postDataJSON()
      expect(body).toEqual({ minutes: 31, priceVersion: 1, method: 'CASH' })
      expect(route.request().headers()['idempotency-key']).toBeTruthy()
      payments.push(body); balanceSeconds += body.minutes * 60
      await route.fulfill({ json: { balanceSeconds, assignments: [] } })
    })
    await login(page, role)
    await page.goto('/gaming-sessions')
    await page.getByRole('button', { name: 'Dodaj vreme', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Plaćanje', exact: true })
    await dialog.getByRole('searchbox', { name: 'Pronađi klijenta' }).fill('Ada')
    const customer = dialog.getByRole('button', { name: /Ada Gaming.*ada@example.test/ })
    await expect(customer).toBeEnabled(); await customer.click()
    await expect(dialog.getByText('75.00 RSD')).toBeVisible()
    const minutes = dialog.getByLabel('Dodaj minute')
    await minutes.fill('29')
    await expect(dialog.getByRole('button', { name: 'Potvrdi uplatu' })).toBeDisabled()
    await minutes.fill('31')
    await expect(dialog.getByText('77.50 RSD')).toBeVisible()
    await expect(dialog.getByText('2h 31m 00s')).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Plaćanje' })).toHaveCount(1)
    await expect(dialog.getByLabel('Primljeni iznos (RSD)')).toHaveCount(0)
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('payment.png'), fullPage: true })
    await dialog.getByRole('button', { name: 'Potvrdi uplatu' }).click()
    await expect(dialog).toHaveCount(0)
    expect(payments).toHaveLength(1)
  })
}
