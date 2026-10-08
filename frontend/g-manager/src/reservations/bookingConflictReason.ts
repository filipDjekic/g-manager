export function bookingConflictReason(reason?: string | null) {
  const messages: Record<string, string> = {
    'Employee is on approved time off': 'Zaposleni nije dostupan zbog odobrenog odsustva.',
    'Reservation is outside working hours': 'Termin je van radnog vremena ili usluga traje posle zatvaranja.',
    'Service duration exceeds working hours': 'Usluga traje posle zatvaranja.',
    'Employee has a reservation at this time': 'Zaposleni ima rezervaciju u ovom terminu.',
    'Resource has a reservation at this time': 'Resurs je zauzet rezervacijom.',
    'Resource has an active gaming session': 'Resurs je zauzet aktivnom gaming sesijom.',
    'Resource or location is inactive or not bookable': 'Resurs ili lokacija trenutno nisu dostupni za rezervisanje.',
    'Station is unavailable for booking': 'Stanica trenutno nije dostupna za rezervisanje.',
    'Location is inactive': 'Lokacija nije aktivna.',
    'Slot must be in the future': 'Termin je već počeo.',
    'Occurrence must be in the future': 'Termin je već počeo.',
    'No compatible bookable resource': 'Nema kompatibilnog resursa za ovu uslugu.',
    'No compatible resource is available at this time': 'Nema slobodnog kompatibilnog resursa.',
    'Employee is unavailable at this time': 'Zaposleni više nije dostupan u ovom terminu.',
    'Resource is unavailable at this time': 'Resurs više nije dostupan u ovom terminu.',
  }
  return reason ? messages[reason] ?? reason : 'Termin više nije dostupan.'
}

