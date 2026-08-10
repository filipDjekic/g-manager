import { useEffect, useRef, useState } from 'react'
import { deleteDraft, loadDraft, saveDraft } from './clientStorage'

export function useEncryptedDraft<T>(userId: string | undefined, form: string, version: number, value: T, restore: (value: T) => void) {
  const hydrated = useRef(false)
  const restoreRef = useRef(restore)
  const [recovered, setRecovered] = useState(false)
  useEffect(() => { restoreRef.current = restore }, [restore])
  useEffect(() => {
    hydrated.current = false
    if (!userId) return
    void loadDraft<T>(userId, form, version).then((draft) => {
      if (draft) { restoreRef.current(draft); setRecovered(true) }
      hydrated.current = true
    }).catch(() => { hydrated.current = true })
  }, [form, userId, version])
  useEffect(() => {
    if (!userId || !hydrated.current) return
    const timer = window.setTimeout(() => { void saveDraft(userId, form, value, version).catch(() => undefined) }, 400)
    return () => window.clearTimeout(timer)
  }, [form, userId, value, version])
  return {
    recovered,
    discard: async () => { if (userId) await deleteDraft(userId, form).catch(() => undefined); setRecovered(false) },
    acknowledge: () => setRecovered(false),
  }
}
