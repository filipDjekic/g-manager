import { apiErrorDetails, apiErrorMessage } from '../api/client'

export function bookingConflictReason(reason?: string | null) {
  const messages: Record<string, string> = {
    'No active employee is available': 'Nema aktivnog zaposlenog dostupnog za rezervaciju.',
    'Area is inactive': 'Izabrana zona nije aktivna.',
    'Area does not belong to the selected location': 'Zona ne pripada izabranom lokalu.',
    'Resource does not belong to the selected area': 'Resurs ne pripada izabranoj zoni.',
    'Resource does not belong to the selected location': 'Resurs ne pripada izabranom lokalu.',
    'Resource does not support the selected service': 'Resurs nije kompatibilan sa izabranom uslugom.',
    'This service has a fixed reservation duration': 'Izabrana usluga ima fiksno trajanje rezervacije.',
    'Reservation duration is outside the permitted range': 'Trajanje nije u dozvoljenom opsegu. Proverite granice prikazane uz interval.',
    'Service has no valid reservation duration': 'Usluga nema podešeno validno trajanje. Obratite se administratoru.',
    'Customer is not available for booking': 'Klijent je deaktiviran ili više nije dostupan za rezervisanje.',
    'Reservation must be in the future': 'Rezervacija mora početi u budućnosti.',
    'Selected user is not an active employee': 'Izabrani zaposleni više nije aktivan.',
    'Selected resource is not bookable for this service': 'Izabrani resurs trenutno nije dostupan za ovu uslugu.',
    'Station management is not permitted': 'Nemate pravo upravljanja izabranim resursom.',
    'Recurring reservation contains unavailable occurrences': 'Neki termini serije nisu dostupni. Proverite pregled ponavljanja.',
    'No recurring occurrence could be reserved': 'Nijedan termin serije nije moguće rezervisati.',
    'Reservation date does not match its start time': 'Datum rezervacije ne odgovara izabranom početku.',
    'Resource interval is invalid': 'Vremenski interval resursa nije validan.',
    'Staff access is required': 'Ova radnja je dostupna osoblju.',
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

export function reservationApiErrorMessage(error: unknown, fallback: string) {
  const message = apiErrorDetails(error)?.message
  const original = apiErrorMessage(error,fallback)
  return message ? original.replace(message,bookingConflictReason(message)) : original
}

