import { useEffect, useState } from 'react'

// One monotonic clock per screen; browser wall-clock changes cannot extend a session.
export function useServerNow(serverTime?: string) {
  const [clock, setClock] = useState(() => ({ source:serverTime, now:serverTime ? Date.parse(serverTime) : Date.now() }))
  useEffect(() => {
    const server = serverTime ? Date.parse(serverTime) : Date.now()
    const received = performance.now()
    const update = () => setClock({ source:serverTime, now:server + Math.max(0, performance.now() - received) })
    const first = window.setTimeout(() => setClock({ source:serverTime, now:server }), 0)
    const timer = window.setInterval(update, 1000)
    return () => { window.clearTimeout(first); window.clearInterval(timer) }
  }, [serverTime])
  return serverTime && clock.source !== serverTime ? Date.parse(serverTime) : clock.now
}
