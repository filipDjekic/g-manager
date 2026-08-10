import { useEffect } from 'react'

export function useDirtyGuard(dirty: boolean) {
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}

export function focusFirstInvalid(form: HTMLFormElement) {
  form.querySelector<HTMLElement>('[aria-invalid="true"], :invalid')?.focus()
}
