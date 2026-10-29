import { useSyncExternalStore } from 'react'
import { useBlocker } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { subscribeUnsavedWork, unsavedWorkState } from './useDirtyGuard'

export function NavigationSafety() {
  const user = useAuthStore(value => value.user)
  const state = useSyncExternalStore(subscribeUnsavedWork, unsavedWorkState, () => 'clean' as const)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const currentWork = unsavedWorkState()
    const pathChanged = currentLocation.pathname !== nextLocation.pathname
    const contextChanged = currentLocation.search !== nextLocation.search || currentLocation.hash !== nextLocation.hash
    return !!user && currentWork !== 'clean' && (pathChanged || contextChanged && currentWork !== 'dirty')
  })
  return <ConfirmDialog open={blocker.state === 'blocked'}
    title={state === 'pending' ? 'Prethodni zahtev čeka proveru' : state === 'handoff' ? 'Sačuvajte jednokratni rezultat' : 'Napusti stranicu?'}
    description={state === 'pending'
      ? 'Ishod slanja još nije potvrđen. Ostanite na stranici i proverite isti zahtev pre nastavka.'
      : state === 'handoff' ? 'Jednokratni kod se prikazuje u otvorenom prozoru. Najpre ga predajte ili preuzmite, pa zatvorite taj prozor.'
      : 'Imate nesačuvane izmene. Ako nastavite, unosi na ovoj stranici biće odbačeni.'}
    variant="warning" confirmLabel="Napusti stranicu" cancelLabel="Ostani na stranici"
    disabled={state === 'pending' || state === 'handoff'} onClose={() => blocker.reset?.()}
    onConfirm={() => blocker.proceed?.()} />
}
