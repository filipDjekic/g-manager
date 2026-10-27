

import { hasCapability } from '../auth/capabilities'


import { type ResourceMenuAction } from '../resources/ResourceMenu'

import type { AuthUser } from '../types/auth.types'

import { type StationTab, type StationView } from './stationPresentation.model'
export interface StationViewHandlers {
  configurationDisabled: boolean
  administrationDisabled: boolean
  details: (station: StationView, tab?: StationTab, trigger?: HTMLElement) => void
  configure: (station: StationView) => void
  identity: (station: StationView) => void
  employees: (station: StationView) => void
}
export const operationsUrl = (station: StationView) => `/gaming-sessions?stationId=${encodeURIComponent(station.resourceId)}`
export function stationMenuActions(station: StationView, user: AuthUser | null, handlers: StationViewHandlers): ResourceMenuAction[] {
  const actions: ResourceMenuAction[] = [{ label: 'Detalji stanice', onClick: () => handlers.details(station) }]
  if (hasCapability(user, 'STATION_MAINTENANCE')) actions.push({ label: 'Podesi stanicu', onClick: () => handlers.configure(station), disabled: handlers.configurationDisabled })
  if (hasCapability(user, 'MACHINE_IDENTITY_MANAGE')) actions.push({ label: 'Identitet Gaming Client-a', onClick: () => handlers.identity(station), disabled: handlers.administrationDisabled })
  if (hasCapability(user, 'RESOURCE_MANAGE')) actions.push({ label: 'Zaposleni na resursu', onClick: () => handlers.employees(station), disabled: handlers.administrationDisabled })
  if (hasCapability(user, 'GAMING_SESSION_READ') && station.live) actions.push({ label: 'Istorija stanice', onClick: () => handlers.details(station, 'HISTORY') })
  return actions
}
