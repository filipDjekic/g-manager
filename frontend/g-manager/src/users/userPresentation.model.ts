


import { hasCapability } from '../auth/capabilities'


import { EmployeeIcon } from '../employees/employeePresentation'
import { employeeDate, employeeError } from '../employees/employeePresentation.model'
import type { AuthUser } from '../types/auth.types'
import type { UserResponse } from '../types/user.types'
export type IconKind = NonNullable<Parameters<typeof EmployeeIcon>[0]['kind']> | 'shield' | 'crown' | 'restore'
export const userDate = employeeDate
export function userError(cause: unknown, fallback: string) {
  return employeeError(cause, fallback)
    .replace('upravljanje zaposlenima', 'upravljanje korisnicima')
    .replace('Email is already used by an active account', 'Email adresu već koristi drugi nalog. Vraćanje nije moguće.')
    .replace('Deleted user not found', 'Obrisani nalog nije pronađen.')
    .replace('Deleted user access is not permitted', 'Nemate dozvolu za pregled obrisanih naloga.')
    .replace('The requested role cannot be created', 'Nemate dozvolu za kreiranje izabrane uloge.')
}
export function canControlUser(actor: AuthUser, target: UserResponse) {
  return actor.id !== target.id && (actor.role === 'OWNER' ? target.role !== 'OWNER' : actor.role === 'ADMIN' && target.role === 'EMPLOYEE')
}
export function allowedUserActions(actor: AuthUser, target: UserResponse) {
  const control = canControlUser(actor, target), deleted = Boolean(target.deletedAt)
  return {
    deactivate: control && !deleted && target.active && hasCapability(actor, 'USER_DEACTIVATE'),
    remove: control && !deleted && hasCapability(actor, 'USER_DELETE'),
    restore: control && deleted && hasCapability(actor, 'USER_RESTORE'),
  }
}

export type UserAction = 'details' | 'deactivate' | 'delete' | 'restore'
export type ActionHandler = (user: UserResponse, action: UserAction, opener: HTMLButtonElement | null) => void
