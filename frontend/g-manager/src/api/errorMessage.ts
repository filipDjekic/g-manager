export function userFacingApiError(
  status: number | undefined,
  message: string | undefined,
  requestId: string | undefined,
  fallback: string,
) {
  let text = message || fallback
  if (status === 409) {
    text = `${text} Osvežite podatke pre ponovnog pokušaja.`
  } else if (status === 429) {
    text = 'Previše zahteva. Sačekajte i pokušajte ponovo.'
  } else if (status === 413) {
    text = 'Fajl je veći od dozvoljene veličine.'
  } else if (status && status >= 500) {
    text = fallback
  }
  return requestId ? `${text} (ID zahteva: ${requestId})` : text
}
