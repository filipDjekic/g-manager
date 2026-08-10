const DB_NAME = 'g-manager-private-v1'
const STORE = 'records'

interface StoredRecord { key: string; userId: string; kind: 'read' | 'draft' | 'key'; value: unknown; updatedAt: number }

function database(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB is unavailable'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = work(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function cacheRead(userId: string, requestKey: string, value: unknown): Promise<void> {
  await transaction('readwrite', (store) => store.put({ key: `read:${userId}:${requestKey}`, userId, kind: 'read', value, updatedAt: Date.now() } satisfies StoredRecord))
}

export async function readCached<T>(userId: string, requestKey: string): Promise<{ value: T; updatedAt: number } | null> {
  const record = await transaction<StoredRecord | undefined>('readonly', (store) => store.get(`read:${userId}:${requestKey}`))
  return record ? { value: record.value as T, updatedAt: record.updatedAt } : null
}

async function encryptionKey(userId: string): Promise<CryptoKey> {
  const id = `key:${userId}`
  const stored = await transaction<StoredRecord | undefined>('readonly', (store) => store.get(id))
  if (stored) return stored.value as CryptoKey
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await transaction('readwrite', (store) => store.put({ key: id, userId, kind: 'key', value: key, updatedAt: Date.now() } satisfies StoredRecord))
  return key
}

export async function saveDraft(userId: string, form: string, value: unknown, version: number): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify({ version, value }))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(userId), plaintext)
  await transaction('readwrite', (store) => store.put({ key: `draft:${userId}:${form}`, userId, kind: 'draft', value: { iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)] }, updatedAt: Date.now() } satisfies StoredRecord))
}

export async function loadDraft<T>(userId: string, form: string, expectedVersion: number): Promise<T | null> {
  const record = await transaction<StoredRecord | undefined>('readonly', (store) => store.get(`draft:${userId}:${form}`))
  if (!record) return null
  try {
    const encrypted = record.value as { iv: number[]; ciphertext: number[] }
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(encrypted.iv) }, await encryptionKey(userId), new Uint8Array(encrypted.ciphertext))
    const draft = JSON.parse(new TextDecoder().decode(plaintext)) as { version: number; value: T }
    if (draft.version !== expectedVersion) { await deleteDraft(userId, form); return null }
    return draft.value
  } catch { await deleteDraft(userId, form); return null }
}

export async function deleteDraft(userId: string, form: string): Promise<void> {
  await transaction('readwrite', (store) => store.delete(`draft:${userId}:${form}`))
}

export async function purgePrivateData(userId?: string): Promise<void> {
  if (!('indexedDB' in globalThis)) return
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE)
    const cursor = store.openCursor()
    cursor.onsuccess = () => { const value = cursor.result; if (!value) return; const record = value.value as StoredRecord; if (!userId || record.userId === userId) value.delete(); value.continue() }
    tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error)
  })
  navigator.serviceWorker?.controller?.postMessage({ type: 'PURGE_PRIVATE' })
}
