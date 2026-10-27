import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

// Reset local drafts/selections in the same render as a navigation or entity change.
// This avoids an effect committing one frame with the previous page's state.
export function useResettableState<T>(initial: () => T, resetKey: string): [T, Dispatch<SetStateAction<T>>] {
  const [stored, setStored] = useState(() => ({ key: resetKey, value: initial() }))
  let current = stored
  if (stored.key !== resetKey) {
    current = { key: resetKey, value: initial() }
    setStored(current)
  }
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(update => setStored(previous => ({
    key: resetKey,
    value: typeof update === 'function' ? (update as (value: T) => T)(previous.value) : update,
  })), [resetKey])
  return [current.value, setValue]
}
