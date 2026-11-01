import { describe, expect, it } from 'vitest'
import { authUser } from '../test/fixtures'
import { testCatalogItem } from '../test/catalogFixtures'
import type { ManagedOrder, OrderStatus } from '../types/order.types'
import { buildCart, calculateEstimatedTotal, normalizeCartQuantities, retainAvailableProducts } from './cart'
import { canChangeOrder, currentPeriod, customerLabel, handlerLabel, initials, itemCountLabel, orderErrorMessage, orderQuantity, periodDates, periodLabel, shortOrderId, validOrderDate } from './orderPresentation.model'

const order = (status: OrderStatus = 'CREATED', handledBy: string | null = null): ManagedOrder => ({ id: '12345678-1234', status, handledBy, handledByName: 'Eva', customerName: 'Ada', items: [{ quantity: 2 }, { quantity: 3 }] } as ManagedOrder)
describe('order ownership and cart recovery policies', () => {
  it('limits employee transitions to the owning handler and protects terminal orders', () => {
    const employee = authUser('EMPLOYEE'), other = authUser('EMPLOYEE', { id: 'other' }), owner = authUser('OWNER')
    expect(canChangeOrder(order(), 'IN_PROGRESS', employee)).toBe(true)
    expect(canChangeOrder(order('IN_PROGRESS', employee.id), 'READY', employee)).toBe(true)
    expect(canChangeOrder(order('IN_PROGRESS', employee.id), 'READY', other)).toBe(false)
    expect(canChangeOrder(order('READY', employee.id), 'COMPLETED', employee)).toBe(true)
    expect(canChangeOrder(order('READY', employee.id), 'CANCELLED', employee)).toBe(false)
    expect(canChangeOrder(order('READY', employee.id), 'CANCELLED', owner)).toBe(true)
    expect(canChangeOrder(order('IN_PROGRESS', employee.id), 'CANCELLED', employee)).toBe(true)
    expect(canChangeOrder(order(), 'CANCELLED', employee)).toBe(true)
    expect(canChangeOrder(order('COMPLETED'), 'READY', owner)).toBe(false)
    expect(canChangeOrder(order(), 'IN_PROGRESS', authUser('CUSTOMER'))).toBe(false)
    expect(canChangeOrder(order(), 'IN_PROGRESS', null)).toBe(false)
    expect(canChangeOrder(order(), 'IN_PROGRESS', authUser('OWNER', { permissions: ['ORDER_READ_ALL'] }))).toBe(false)
    expect(canChangeOrder(order(), 'CREATED', owner)).toBe(false)
  })

  it('discards malformed draft quantities and removed products before estimating the order', () => {
    for (const malformed of [null, undefined, 'invalid', [], 1]) expect(normalizeCartQuantities(malformed)).toEqual({})
    const quantities = normalizeCartQuantities({ a: 2.9, b: 999, missing: 1, empty: 0, negative: -1, huge: 1000, string: '2', infinite: Infinity, '': 1 })
    expect(quantities).toEqual({ a: 2, b: 999, missing: 1 })
    const available = retainAvailableProducts(quantities, new Set(['a', 'b']))
    const cart = buildCart([testCatalogItem({ id: 'a', type: 'PRODUCT', price: 10 }), testCatalogItem({ id: 'b', type: 'PRODUCT', price: 20 }), testCatalogItem({ id: 'c', type: 'PRODUCT' })], available)
    expect(cart.map(line => [line.product.id, line.quantity])).toEqual([['a', 2], ['b', 999]])
    expect(calculateEstimatedTotal(cart)).toBe(20000)
    expect(calculateEstimatedTotal([])).toBe(0)
  })

  it('does not disclose customer identity without permission and identifies the current handler', () => {
    const employee = authUser('EMPLOYEE')
    expect(customerLabel(order(), authUser('CUSTOMER'))).toBe('Podaci o klijentu nisu dostupni')
    expect(customerLabel(order(), authUser('OWNER'))).toBe('Ada')
    expect(customerLabel({ ...order(), customerName: null }, authUser('OWNER'))).toBe('Klijent nije dostupan')
    expect(handlerLabel(order(), employee)).toBe('Nepreuzeta')
    expect(handlerLabel(order('IN_PROGRESS', employee.id), employee)).toBe(`${employee.name} (vi)`)
    expect(handlerLabel(order('IN_PROGRESS', 'other'), employee)).toBe('Eva')
    expect(handlerLabel({ ...order('IN_PROGRESS', 'other'), handledByName: null }, null)).toBe('Osoba nije dostupna')
    expect(shortOrderId(order().id)).toBe('#12345678')
    expect(orderQuantity(order())).toBe(5)
    expect(initials('  Ada   Lovelace  ')).toBe('AL'); expect(initials(null)).toBe('?')
    expect([1, 2, 5, 11, 12, 14, 21, 24].map(itemCountLabel)).toEqual(['1 stavka', '2 stavke', '5 stavki', '11 stavki', '12 stavki', '14 stavki', '21 stavka', '24 stavke'])
  })

  it('uses inclusive business-date periods and rejects impossible calendar dates', () => {
    expect(periodDates('WEEK', '2028-03-02')).toEqual({ from: '2028-02-25', to: '2028-03-02' })
    expect(periodDates('MONTH', '2028-03-02')).toEqual({ from: '2028-02-02', to: '2028-03-02' })
    expect(periodDates('THIS_MONTH', '2028-03-02')).toEqual({ from: '2028-03-01', to: '2028-03-02' })
    expect(periodDates('TODAY', '2028-03-02')).toEqual({ from: '2028-03-02', to: '2028-03-02' })
    expect(currentPeriod('', '')).toBe('ALL'); expect(currentPeriod('2020-01-01', '2020-01-03')).toBe('CUSTOM')
    for (const value of ['', '2028-02-29']) expect(validOrderDate(value)).toBe(true)
    for (const value of ['2027-02-29', '0000-01-01', '01-02-2028', '2028-13-01']) expect(validOrderDate(value)).toBe(false)
    expect(periodLabel()).toBe('Sve vreme'); expect(periodLabel('2028-03-02')).toMatch(/^Od /); expect(periodLabel(null, '2028-03-02')).toMatch(/^Do /)
    expect(periodLabel('2028-03-01', '2028-03-02')).toContain('–')
    expect(orderErrorMessage(new Error('Invalid order status transition'), 'Fallback')).toBe('Ova promena statusa više nije dostupna.')
    expect(orderErrorMessage(new Error(''), 'Fallback')).toBe('Fallback')
  })
})
