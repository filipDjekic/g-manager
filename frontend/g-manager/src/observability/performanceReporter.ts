export type WebVitalName = 'CLS' | 'INP' | 'LCP'

export interface WebVitalEvent {
  type: 'web_vital'
  name: WebVitalName
  value: number
  release: string
  navigation: 'navigate' | 'reload' | 'back_forward' | 'prerender' | 'unknown'
}

export type PerformanceTransport = (event: WebVitalEvent) => void

let transport: PerformanceTransport = (event) => {
  if (import.meta.env.DEV) console.info('web_vital', event)
}

export function configurePerformanceTransport(next: PerformanceTransport): () => void {
  const previous = transport
  transport = next
  return () => { transport = previous }
}

export function reportWebVital(name: WebVitalName, value: number): void {
  if (!Number.isFinite(value) || value < 0) return
  const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  transport({
    type: 'web_vital',
    name,
    value: Math.round(value * 1000) / 1000,
    release: import.meta.env.VITE_RELEASE ?? 'development',
    navigation: navigationEntry?.type ?? 'unknown',
  })
}

export function installWebVitalsReporting(): void {
  if (!('PerformanceObserver' in window)) return
  let cls = 0
  const observe = (type: string, callback: (entry: PerformanceEntry) => void) => {
    try {
      const observer = new PerformanceObserver((list) => list.getEntries().forEach(callback))
      observer.observe({ type, buffered: true })
    } catch {
      // The browser does not support this entry type.
    }
  }
  observe('largest-contentful-paint', (entry) => reportWebVital('LCP', entry.startTime))
  observe('event', (entry) => {
    const duration = (entry as PerformanceEntry & { duration: number }).duration
    if (duration > 0) reportWebVital('INP', duration)
  })
  observe('layout-shift', (entry) => {
    const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
    if (!shift.hadRecentInput) {
      cls += shift.value
      reportWebVital('CLS', cls)
    }
  })
}
