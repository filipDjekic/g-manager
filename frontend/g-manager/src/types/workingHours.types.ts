export type DayOfWeek =
  | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY'
  | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

export interface WorkingHours {
  id: string
  dayOfWeek: DayOfWeek
  openTime: string
  closeTime: string
  active: boolean
  spansMidnight: boolean
  version: number
}

export interface WorkingHoursException {
  id: string
  date: string
  description: string | null
  fullDayClosed: boolean
  overrideOpenTime: string | null
  overrideCloseTime: string | null
  version: number
}

export interface WorkingHoursExceptionInput {
  date: string
  description?: string
  fullDayClosed: boolean
  overrideOpenTime?: string
  overrideCloseTime?: string
  version?: number
}
