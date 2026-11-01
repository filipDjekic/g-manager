import { webcrypto } from 'node:crypto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheRead, deleteDraft, loadDraft, purgePrivateData, readCached, saveDraft } from './clientStorage'

async function record(key: string, change?: (value: Record<string, unknown>) => Record<string, unknown>) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('g-manager-private-v1', 1)
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
  })
  return new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
    const tx = db.transaction('records', change ? 'readwrite' : 'readonly'), store = tx.objectStore('records'), request = store.get(key)
    let value: Record<string, unknown> | undefined
    request.onsuccess = () => { value = request.result; if (change && value) store.put(change(value)) }
    tx.oncomplete = () => { db.close(); resolve(value) }; tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
describe('private browser storage boundaries', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    vi.stubGlobal('crypto', webcrypto)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('isolates cached responses by both account and request key', async () => {
    await cacheRead('actor-a', '/catalog?page=1', { content: ['A'] })
    await cacheRead('actor-b', '/catalog?page=1', { content: ['B'] })
    expect(await readCached('actor-a', '/catalog?page=1')).toMatchObject({ value: { content: ['A'] }, updatedAt: expect.any(Number) })
    expect(await readCached('actor-b', '/catalog?page=1')).toMatchObject({ value: { content: ['B'] } })
    expect(await readCached('actor-a', '/catalog?page=2')).toBeNull()
  })

  it('encrypts drafts at rest with a non-exportable account key and supports replacement', async () => {
    const draft = { note: 'Private reservation note', customerId: 'customer-1' }
    await saveDraft('actor-a', 'booking', draft, 2)
    const stored = await record('draft:actor-a:booking'), key = await record('key:actor-a')
    expect(JSON.stringify(stored)).not.toContain(draft.note)
    expect(JSON.stringify(stored)).not.toContain(draft.customerId)
    expect((key!.value as CryptoKey).extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', key!.value as CryptoKey)).rejects.toThrow()
    expect(await loadDraft('actor-a', 'booking', 2)).toEqual(draft)
    expect(await loadDraft('actor-b', 'booking', 2)).toBeNull()
    await saveDraft('actor-a', 'booking', { note: 'Updated note' }, 2)
    expect(await loadDraft('actor-a', 'booking', 2)).toEqual({ note: 'Updated note' })
    await deleteDraft('actor-a', 'booking')
    expect(await loadDraft('actor-a', 'booking', 2)).toBeNull()
  })

  it('removes incompatible and tampered ciphertext instead of recovering an unsafe draft', async () => {
    await saveDraft('actor-a', 'booking', { note: 'Old schema' }, 1)
    expect(await loadDraft('actor-a', 'booking', 2)).toBeNull()
    expect(await record('draft:actor-a:booking')).toBeUndefined()
    await saveDraft('actor-a', 'booking', { note: 'Protected' }, 2)
    await record('draft:actor-a:booking', value => ({ ...value, value: { iv: [0, 1], ciphertext: [2, 3] } }))
    expect(await loadDraft('actor-a', 'booking', 2)).toBeNull()
    expect(await record('draft:actor-a:booking')).toBeUndefined()
  })

  it('purges one account without removing another and notifies the worker on a full purge', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker: { controller: { postMessage } } })
    for (const actor of ['actor-a', 'actor-b']) {
      await cacheRead(actor, '/catalog', [actor]); await saveDraft(actor, 'booking', { actor }, 1)
    }
    await purgePrivateData('actor-a')
    expect(await readCached('actor-a', '/catalog')).toBeNull()
    expect(await loadDraft('actor-a', 'booking', 1)).toBeNull()
    expect(await record('key:actor-a')).toBeUndefined()
    expect(await readCached('actor-b', '/catalog')).toMatchObject({ value: ['actor-b'] })
    expect(await loadDraft('actor-b', 'booking', 1)).toEqual({ actor: 'actor-b' })
    await purgePrivateData()
    expect(await readCached('actor-b', '/catalog')).toBeNull()
    expect(await record('key:actor-b')).toBeUndefined()
    expect(postMessage).toHaveBeenCalledWith({ type: 'PURGE_PRIVATE' })
  })

  it('fails explicitly when IndexedDB is unavailable while logout purge remains safe', async () => {
    Reflect.deleteProperty(globalThis, 'indexedDB')
    await expect(cacheRead('actor-a', 'request', {})).rejects.toThrow('IndexedDB is unavailable')
    await expect(purgePrivateData()).resolves.toBeUndefined()
  })
})
