export function userFacingApiError(
  status: number | undefined,
  message: string | undefined,
  requestId: string | undefined,
  fallback: string,
) {
  const waitlistMessages: Record<string, string> = {
    'An active waitlist entry already exists': 'Već imate aktivnu prijavu za ovaj termin.',
    'Slot is available and can be reserved directly': 'Termin je oslobođen. Možete ga rezervisati direktno.',
    'Waitlist offer has expired': 'Ponuda je istekla. Rezervacija nije potvrđena.',
    'Waitlist offer has expired or is no longer active': 'Ponuda je istekla ili više nije aktivna. Rezervacija nije potvrđena.',
    'Accepted waitlist entry cannot be cancelled': 'Prihvaćena prijava ne može se otkazati. Rezervaciju možete zasebno otkazati u Mojim terminima.',
    'Waitlist entry was changed; refresh and try again': 'Prijava se promenila. Osvežite listu čekanja i pokušajte ponovo.',
  }
  let text = message ? waitlistMessages[message] ?? message : fallback
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
