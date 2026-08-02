const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Belgrade',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function businessDate(value: Date): string {
  const parts = Object.fromEntries(
    businessDateFormatter.formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function currentBusinessMonth(value = new Date()) {
  const to = businessDate(value)
  return { from: `${to.slice(0, 7)}-01`, to }
}
