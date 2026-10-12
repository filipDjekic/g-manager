import { useQuery } from '@tanstack/react-query'
import { stationApi } from '../api/stationApi'
import type { GamingClientPackage, GamingClientPackageAvailability } from '../types/station.types'

const unpublished = 'Gaming Client paket još nije objavljen.'
const archiveName = 'GManager.Client.zip'

function packageConfiguration(data?: GamingClientPackage) {
  if (!data || data.status.trim() !== 'RELEASED') return { url: null, message: unpublished }
  if (!/^[0-9]+[.][0-9]+(?:[.][0-9]+){0,2}$/.test(data.version.trim()) || !/^[0-9a-f]{64}$/i.test(data.sha256)
      || !data.signingSubject?.trim() || data.signingSubject.trim().toUpperCase() === 'UNPUBLISHED') {
    return { url: null, message: 'Objava paketa nema ispravnu verziju, SHA-256 ili podatak o potpisivanju.' }
  }
  try {
    const value = data.downloadUrl.trim()
    if (!value || !((value.startsWith('/') && !value.startsWith('//')) || /^https:\/\//i.test(value))) {
      return { url: null, message: 'URL za preuzimanje paketa nije ispravno konfigurisan.' }
    }
    const url = new URL(value, window.location.origin)
    if (url.username || url.password || (url.origin !== window.location.origin && url.protocol !== 'https:')) {
      return { url: null, message: 'Spoljašnje preuzimanje zahteva ispravan HTTPS URL.' }
    }
    return { url, message: '' }
  } catch { return { url: null, message: 'URL za preuzimanje paketa nije ispravno konfigurisan.' } }
}

function zipContentType(value: string | null) {
  return ['application/zip', 'application/x-zip-compressed', 'application/octet-stream']
    .includes((value ?? '').split(';')[0].trim().toLowerCase())
}

async function localAvailability(url: URL, signal: AbortSignal): Promise<GamingClientPackageAvailability> {
  const response = await fetch(url.href, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal })
  if (response.status === 404) return { available: false, message: unpublished }
  if (!response.ok) return { available: false, message: 'Gaming Client paket trenutno nije dostupan. Pokušajte ponovo.' }
  if (!zipContentType(response.headers.get('Content-Type')) || response.headers.get('Content-Length') === '0') {
    return { available: false, message: 'Konfigurisana adresa ne vraća ZIP paket. Proverite objavu Gaming Client-a.' }
  }
  return { available: true, message: '' }
}

export function useClientPackageAvailability(data?: GamingClientPackage) {
  const configuration = packageConfiguration(data)
  const url = configuration.url
  const check = useQuery({
    queryKey: ['stations', 'client-package-availability', url?.href, data?.sha256, data?.status, data?.signingSubject],
    enabled: !!url,
    retry: false,
    staleTime: 30000,
    queryFn: ({ signal }) => {
      if (!url) throw new Error(unpublished)
      return url.origin === window.location.origin ? localAvailability(url, signal) : stationApi.clientPackageAvailability(signal)
    },
  })
  return {
    url,
    ready: !!url && !check.isError && check.data?.available === true,
    checking: !!url && check.isFetching,
    known: !url || check.data !== undefined || check.isError,
    error: check.error,
    message: configuration.message || (check.isError ? 'Dostupnost Gaming Client paketa nije moguće potvrditi. Pokušajte ponovo.' : check.data?.message ?? ''),
    refetch: check.refetch,
  }
}

export async function downloadClientPackage(data: GamingClientPackage, signal: AbortSignal) {
  const { url, message } = packageConfiguration(data)
  if (!url) throw new Error(message)
  if (!globalThis.crypto?.subtle) throw new Error('Za proveru integriteta paketa otvorite aplikaciju preko HTTPS-a ili localhost-a.')
  let bytes: ArrayBuffer
  if (url.origin === window.location.origin) {
    const response = await fetch(url.href, { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal })
    if (response.status === 404) throw new Error(unpublished)
    if (!response.ok) throw new Error('Gaming Client paket trenutno nije dostupan. Pokušajte ponovo.')
    if (!zipContentType(response.headers.get('Content-Type'))) throw new Error('Adresa za preuzimanje ne vraća ZIP paket.')
    bytes = await response.arrayBuffer()
  } else {
    // The existing API authenticates the request. The backend only forwards the
    // configured HTTPS artifact, without leaking credentials to the publisher.
    bytes = await stationApi.clientPackageDownload(signal)
  }
  const prefix = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4))
  if (prefix.length !== 4 || prefix[0] !== 0x50 || prefix[1] !== 0x4b || prefix[2] !== 0x03 || prefix[3] !== 0x04) {
    throw new Error('Preuzeti sadržaj nije ispravan ZIP paket. Fajl nije sačuvan.')
  }
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  const actual = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('')
  if (actual !== data.sha256.toLowerCase()) throw new Error('SHA-256 paketa se ne poklapa sa objavljenom vrednošću. Fajl nije sačuvan.')
  signal.throwIfAborted()
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = objectUrl; link.download = archiveName
  document.body.append(link)
  try { link.click() } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000) }
}
