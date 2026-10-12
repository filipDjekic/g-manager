import { useQueries, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { catalogApi } from '../../api/catalogApi'
import { orderApi } from '../../api/orderApi'
import { IdempotencyKeyManager } from '../../api/idempotency'
import { useAuthStore } from '../../auth/authStore'
import { hasCapability } from '../../auth/capabilities'
import { deleteDraft, loadDraft, saveDraft } from '../../pwa/clientStorage'
import type { PageResponse } from '../../types/api.types'
import type { CatalogItem } from '../../types/catalog.types'
import type { CreateOrderInput } from '../../types/order.types'
import { buildCart, calculateEstimatedTotal, CART_DRAFT_VERSION, normalizeCartQuantities, retainAvailableProducts, type CartLine } from '../cart'
import { orderErrorMessage } from '../orderPresentation'

export interface CustomerOrderAttempt { key: string; items: CreateOrderInput['items']; estimatedTotal: number }
interface CartState { ready: boolean; quantities: Record<string, number>; attempt: CustomerOrderAttempt | null }
const draftWrites = new Map<string, Promise<void>>()

function savedAttempt(value: unknown): CustomerOrderAttempt | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<CustomerOrderAttempt>
  if (typeof entry.key !== 'string' || !entry.key || entry.key.length > 255 || !Array.isArray(entry.items) || !entry.items.length
    || typeof entry.estimatedTotal !== 'number' || !Number.isFinite(entry.estimatedTotal) || entry.estimatedTotal < 0) return null
  const ids = new Set<string>()
  for (const item of entry.items) {
    if (!item || typeof item.productId !== 'string' || !item.productId || ids.has(item.productId)
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) return null
    ids.add(item.productId)
  }
  return { key: entry.key, items: entry.items, estimatedTotal: entry.estimatedTotal }
}

export function useCustomerCart(userId: string, canCatalog: boolean) {
  const client = useQueryClient()
  const [state, setState] = useState<CartState>({ ready: false, quantities: {}, attempt: null })
  const [warning, setWarning] = useState(''), [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false), [submitError, setSubmitError] = useState('')
  const [restore, setRestore] = useState(0)
  const mounted = useRef(false), latest = useRef(state)
  const createAttempt = useRef(new IdempotencyKeyManager()), submitInFlight = useRef(false)
  const prices = useRef(new Map<string, number>())
  latest.current = state
  const currentActor = useCallback(() => mounted.current && useAuthStore.getState().user?.id === userId, [userId])

  // Serialize writes so an older cart snapshot cannot overwrite a submitted attempt or an empty cart.
  const persist = useCallback((snapshot: CartState) => {
    const operation = (draftWrites.get(userId) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      if (useAuthStore.getState().user?.id !== userId) return
      if (!Object.keys(snapshot.quantities).length && !snapshot.attempt) await deleteDraft(userId, 'order-cart')
      else await saveDraft(userId, 'order-cart', {
        ...snapshot.quantities, ...(snapshot.attempt ? { __attempt: snapshot.attempt } : {}),
      }, CART_DRAFT_VERSION)
      if (currentActor()) setWarning('')
    })
    const settled = operation.catch(() => undefined)
    draftWrites.set(userId, settled)
    void settled.then(() => { if (draftWrites.get(userId) === settled) draftWrites.delete(userId) })
    return operation
  }, [currentActor, userId])

  useEffect(() => {
    mounted.current = true
    let active = true
    void (draftWrites.get(userId) ?? Promise.resolve()).then(() => loadDraft<unknown>(userId, 'order-cart', CART_DRAFT_VERSION)).then(stored => {
      if (!active || !currentActor()) return
      const attempt = savedAttempt(stored && typeof stored === 'object' ? (stored as Record<string, unknown>).__attempt : null)
      const quantities = normalizeCartQuantities(stored)
      if (attempt) {
        createAttempt.current = new IdempotencyKeyManager(() => attempt.key)
        createAttempt.current.begin()
        attempt.items.forEach(item => { quantities[item.productId] = item.quantity })
        setNotice('Prethodno slanje čeka proveru ishoda. Ponovni pokušaj koristi sačuvani zahtev.')
      }
      setState({ ready: true, quantities, attempt })
    }).catch(() => {
      if (active && currentActor()) setWarning('Korpu nije moguće učitati sa ovog uređaja. Sačuvana korpa nije izmenjena.')
    })
    return () => { active = false; mounted.current = false }
  }, [currentActor, userId, restore])

  useEffect(() => {
    if (!state.ready) return
    void persist(state).catch(() => { if (currentActor()) setWarning('Korpu nije moguće sačuvati na ovom uređaju.') })
  }, [state, persist, currentActor])

  const ids = Object.keys(state.quantities).sort()
  const products = useQueries({ queries: ids.map(id => ({
    queryKey: ['catalog', 'customer-product', userId, id], queryFn: () => catalogApi.get(id), enabled: state.ready && canCatalog,
    staleTime: 30000, refetchInterval: 30000, refetchIntervalInBackground: false,
    retry: (count: number, cause: unknown) => !(isAxiosError(cause) && [403, 404].includes(cause.response?.status ?? 0)) && count < 1,
    initialData: () => {
      for (const [, data] of client.getQueriesData<PageResponse<CatalogItem>>({ queryKey: ['catalog', 'customer-products', userId] })) {
        const product = data?.content.find(value => value.id === id)
        if (product) return product
      }
      return undefined
    },
    initialDataUpdatedAt: () => {
      for (const [key, data] of client.getQueriesData<PageResponse<CatalogItem>>({ queryKey: ['catalog', 'customer-products', userId] })) {
        if (data?.content.some(value => value.id === id)) return client.getQueryState(key)?.dataUpdatedAt
      }
      return undefined
    },
  })) })
  const resolved = canCatalog ? products.flatMap(query => query.data && query.isSuccess
    && query.data.type === 'PRODUCT' && query.data.active && !query.data.deletedAt ? [query.data] : []) : []
  const cart = useMemo(() => buildCart(resolved, state.quantities), [resolved, state.quantities])
  const unresolved = ids.filter(id => !cart.some(line => line.product.id === id))
  const estimatedTotal = unresolved.length ? null : calculateEstimatedTotal(cart)
  const unavailable = canCatalog ? ids.filter((_, index) => {
    const query = products[index], error = query.error
    return query.isSuccess && (query.data?.type !== 'PRODUCT' || !query.data?.active || Boolean(query.data?.deletedAt))
      || isAxiosError(error) && error.response?.status === 404
  }) : []

  useEffect(() => {
    if (!state.ready || state.attempt || !unavailable.length) return
    const excluded = new Set(unavailable)
    setState(previous => previous.attempt ? previous : { ...previous,
      quantities: retainAvailableProducts(previous.quantities, new Set(Object.keys(previous.quantities).filter(id => !excluded.has(id)))),
    })
    setNotice('Proizvodi za koje je potvrđeno da nisu dostupni uklonjeni su iz korpe.')
  }, [state.ready, state.attempt, unavailable.join('|')])

  useEffect(() => {
    let changed = false
    resolved.forEach(product => {
      if (prices.current.has(product.id) && prices.current.get(product.id) !== product.price) changed = true
      prices.current.set(product.id, product.price)
    })
    if (changed) setNotice('Cena proizvoda u korpi se promenila. Informativni obračun je ažuriran; konačnu cenu potvrđuje server.')
  }, [resolved])

  function change(id: string, quantity: number) {
    if (!state.ready || state.attempt || submitInFlight.current || !Number.isFinite(quantity)) return
    setState(previous => {
      if (previous.attempt) return previous
      const quantities = { ...previous.quantities }, amount = Math.max(0, Math.min(999, Math.trunc(quantity)))
      if (amount) quantities[id] = amount; else delete quantities[id]
      return { ...previous, quantities }
    })
    setSubmitError('')
  }
  function add(product: CatalogItem, minimum = false) {
    if (!canCatalog || !product.active || product.deletedAt || product.type !== 'PRODUCT' || state.attempt || submitInFlight.current) return
    const key = ['catalog', 'customer-product', userId, product.id]
    const cached = client.getQueryData<CatalogItem>(key)
    if (!cached || cached.version <= product.version) client.setQueryData(key, product)
    setState(previous => {
      if (!previous.ready || previous.attempt) return previous
      return { ...previous, quantities: { ...previous.quantities, [product.id]: minimum
        ? Math.max(1, previous.quantities[product.id] ?? 0) : Math.min(999, (previous.quantities[product.id] ?? 0) + 1) } }
    })
    setSubmitError('')
  }
  function clear() {
    if (submitInFlight.current || latest.current.attempt) return
    setState(previous => ({ ...previous, quantities: {} })); setSubmitError('')
  }

  async function send(snapshot: CartLine[]) {
    const actor = useAuthStore.getState().user
    if (!currentActor() || actor?.role !== 'CUSTOMER' || !hasCapability(actor, 'ORDER_CREATE') || !state.ready || submitInFlight.current) return undefined
    const previousAttempt = latest.current.attempt
    if (!previousAttempt && (!snapshot.length || unresolved.length)) throw new Error('Sačekajte potvrdu podataka svih proizvoda iz korpe.')
    submitInFlight.current = true; setSubmitting(true); setSubmitError('')
    const attempt = previousAttempt ?? { key: createAttempt.current.begin(), estimatedTotal: calculateEstimatedTotal(snapshot),
      items: snapshot.map(({ product, quantity }) => ({ productId: product.id, quantity })).sort((a, b) => a.productId.localeCompare(b.productId)) }
    const pending = { ...latest.current, attempt }
    latest.current = pending; setState(pending)
    let requested = false
    try {
      if (!previousAttempt) {
        try { await persist(pending) }
        catch { throw new Error('Pokušaj slanja nije moguće sačuvati na uređaju. Narudžbina nije poslata. Pokušajte ponovo.') }
      }
      if (!currentActor()) return undefined
      requested = true
      const created = await orderApi.create({ items: attempt.items }, attempt.key)
      createAttempt.current.succeeded(); createAttempt.current = new IdempotencyKeyManager()
      if (!currentActor()) return undefined
      const cleared = { ready: true, quantities: {}, attempt: null }
      latest.current = cleared; setState(cleared)
      setNotice('')
      await persist(cleared).catch(() => { if (currentActor()) setWarning('Narudžbina je potvrđena, ali praznu korpu nije moguće sačuvati na uređaju.') })
      if (!currentActor()) return undefined
      if (Math.abs(created.totalPrice - attempt.estimatedTotal) > .005) setNotice('Server je potvrdio drugačiji konačni iznos od prethodnog informativnog obračuna.')
      return created
    } catch (cause) {
      if (!currentActor()) return undefined
      const code = isAxiosError(cause) ? cause.response?.status : undefined
      const conflictKey = code === 409 && isAxiosError(cause) && String(cause.response?.data?.message ?? '').includes('Idempotency-Key')
      // A denied retry does not establish whether the original request already committed.
      const deniedRetry = Boolean(previousAttempt) && (code === 401 || code === 403)
      const uncertain = requested && isAxiosError(cause) && (!cause.response || code === 425 || (code ?? 0) >= 500 || conflictKey || deniedRetry)
      if (!uncertain) {
        createAttempt.current.failed(cause); createAttempt.current = new IdempotencyKeyManager()
        const released = { ...latest.current, attempt: null }
        latest.current = released; setState(released)
        setNotice('')
      } else {
        if (isAxiosError(cause) && (!cause.response || code === 425)) createAttempt.current.failed(cause)
        setNotice('Ishod slanja još nije potvrđen. Korpa je sačuvana i zaključana; proverite prethodno slanje istim zahtevom.')
      }
      const message = uncertain ? 'Ishod prethodnog slanja nije poznat. Ponovni pokušaj proverava isti zahtev uz zaštitu od duplog slanja.'
        : orderErrorMessage(cause, 'Narudžbinu nije moguće poslati.')
      setSubmitError(message)
      if (!uncertain) void Promise.all([
        client.invalidateQueries({ queryKey: ['catalog', 'customer-product', userId] }),
        client.invalidateQueries({ queryKey: ['catalog', 'customer-products', userId] }),
      ])
      throw new Error(message)
    } finally {
      submitInFlight.current = false
      if (currentActor()) setSubmitting(false)
    }
  }

  return { ready: state.ready, canCatalog, quantities: state.quantities, attempt: state.attempt, cart, unresolved, products, ids,
    estimatedTotal, warning, notice, submitting, submitError, change, add, clear, send,
    retryProducts: () => canCatalog ? Promise.all(products.map(query => query.refetch())) : Promise.resolve([]),
    retryDraft: () => { setWarning(''); setRestore(value => value + 1) } }
}
