import type { FieldValues, Path, UseFormSetError, UseFormSetFocus } from 'react-hook-form'
import { apiErrorDetails } from '../api/client'

export function applyApiFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  setFocus: UseFormSetFocus<T>,
): boolean {
  const fieldErrors = apiErrorDetails(error)?.fieldErrors ?? []
  if (fieldErrors.length === 0) return false

  for (const fieldError of fieldErrors) {
    setError(fieldError.field as Path<T>, { type: 'server', message: fieldError.message })
  }
  const firstField = fieldErrors[0]?.field as Path<T> | undefined
  if (firstField) queueMicrotask(() => setFocus(firstField))
  return true
}
