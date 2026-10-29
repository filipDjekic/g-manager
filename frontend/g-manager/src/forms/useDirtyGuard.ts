import { useCallback, useEffect, useId } from 'react'

const work = new Map<string, 'dirty' | 'pending' | 'handoff'>()
const listeners = new Set<() => void>()
export function unsavedWorkState(): 'clean' | 'dirty' | 'pending' | 'handoff' {
  return [...work.values()].includes('pending') ? 'pending' : [...work.values()].includes('handoff') ? 'handoff' : work.size ? 'dirty' : 'clean'
}
export function subscribeUnsavedWork(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useDirtyGuard(dirty: boolean, options: { pending?: boolean; retainedResult?: boolean } = {}) {
  const id = useId(), pending = options.pending === true, retained = options.retainedResult === true
  const release = useCallback(() => {
    work.delete(id); listeners.forEach(listener => listener())
  }, [id])
  useEffect(() => {
    if (!dirty) return
    work.set(id, pending ? 'pending' : retained ? 'handoff' : 'dirty')
    listeners.forEach(listener => listener())
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      work.delete(id)
      listeners.forEach(listener => listener())
      window.removeEventListener('beforeunload', warn)
    }
  }, [dirty, id, pending, retained])
  return release
}

export function focusFirstInvalid(form: HTMLFormElement) {
  form.querySelector<HTMLElement>('[aria-invalid="true"], :invalid')?.focus()
}
