
export function readGamingPage(value: string): number {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page - 1 : 0
}
