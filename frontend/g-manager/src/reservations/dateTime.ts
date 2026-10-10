const businessZone = 'Europe/Belgrade'

export function businessInstantToLocal(value: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: businessZone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  }).formatToParts(new Date(value)).map(part=>[part.type,part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function businessLocalToInstant(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('Datum i vreme nisu validni.')
  const [, year, month, day, hour, minute] = match
  const desiredUtc = Date.UTC(
    Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute),
  )
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: businessZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  let candidate = desiredUtc
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate))
      .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    if (represented === desiredUtc) {
      const instant = new Date(candidate).toISOString()
      if (businessInstantToLocal(instant) === value) return instant
      break
    }
    candidate += desiredUtc - represented
  }
  throw new Error('Izabrano lokalno vreme ne postoji ili datum nije validan. Proverite prelazak na letnje računanje vremena.')
}

export function formatBusinessDateTime(value: string, includeSeconds = false, locale = 'sr-RS'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: businessZone,
    dateStyle: 'medium',
    timeStyle: includeSeconds ? 'medium' : 'short',
  }).format(new Date(value))
}

export function formatBusinessIntervalEnd(start: string, end: string, locale = 'sr-RS'): string {
  return businessInstantToLocal(start).slice(0,10) === businessInstantToLocal(end).slice(0,10)
    ? formatBusinessTime(end) : formatBusinessDateTime(end,false,locale)
}

export function formatBusinessTime(value: string): string {
  return new Intl.DateTimeFormat('sr-RS', {
    timeZone: businessZone, hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

export function todayInBusinessZone(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: businessZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function dateInBusinessZone(instant: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: businessZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(instant))
}
