const businessZone = 'Europe/Belgrade'

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
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(desiredUtc))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  const representedUtc = Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour, parts.minute,
  )
  const offset = representedUtc - desiredUtc
  return new Date(desiredUtc - offset).toISOString()
}

export function formatBusinessDateTime(value: string): string {
  return new Intl.DateTimeFormat('sr-RS', {
    timeZone: businessZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
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
