

import { isAxiosError } from 'axios'


import { apiErrorMessage } from '../api/client'





import { formatBusinessDateTime } from '../reservations/dateTime'

export const employeeDate = (value: string) => formatBusinessDateTime(value, false, 'sr-Latn-RS')
export function employeeError(cause: unknown, fallback: string) {
  const message = typeof cause === 'string' ? cause : cause instanceof Error && !isAxiosError(cause) ? cause.message : apiErrorMessage(cause, fallback)
  return message
    .replace('Email is already in use', 'Email adresa je već zauzeta.')
    .replace('Employee not found', 'Zaposleni nije pronađen.')
    .replace('User not found', 'Nalog nije pronađen.')
    .replace('Employee is inactive', 'Nalog zaposlenog je neaktivan.')
    .replace('Location access changed; refresh before saving', 'Dodela lokacije je promenjena. Pregledajte osvežene podatke pre nove potvrde.')
    .replace('User management is not permitted', 'Nemate dozvolu za upravljanje zaposlenima.')
    .replace('You cannot deactivate your own account', 'Sopstveni nalog ne možete deaktivirati.')
    .replace('The requested user cannot be deactivated', 'Nemate dozvolu za deaktivaciju ovog naloga.')
    .replace('User is not active', 'Nalog nije aktivan.')
    .replace('Access is denied', 'Nemate dozvolu za ovu akciju.')
    .replace('Authentication is required', 'Potrebno je da se ponovo prijavite.')
}

export type EmployeeAction = 'profile' | 'deactivate' | 'delete'
