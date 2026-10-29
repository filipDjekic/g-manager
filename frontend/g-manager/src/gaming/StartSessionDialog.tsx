import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { CustomerSearch, type CustomerChoice } from '../customers/CustomerSearch'
import { CustomerFormDialog } from '../customers/CustomerFormDialog'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { apiErrorMessage } from '../api/client'
import { IdempotencyKeyManager } from '../api/idempotency'
import { Button, EmptyState, ErrorState, Modal, Skeleton, Input, Select, Alert } from '../components/ui'
import type { GamingStationCard, StartGamingSessionInput } from '../types/gamingSession.types'

export function StartSessionDialog({ station, customer, onClose, onStarted, reservation }: {
  station?: GamingStationCard; customer?: CustomerChoice; onClose: () => void; onStarted?: () => void; reservation?: { id: string; resourceId: string; durationMinutes?: number }
}) {
  const client = useQueryClient()
  const actor = useAuthStore(state => state.user)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<CustomerChoice | null>(customer ?? null)
  const [resourceId, setResourceId] = useState(station?.resourceId ?? reservation?.resourceId ?? '')
  const [duration, setDuration] = useState(reservation?.durationMinutes ?? 120), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [retryRequest, setRetryRequest] = useState<StartGamingSessionInput | null>(null)
  const inFlight = useRef(false), key = useRef(new IdempotencyKeyManager()), input = useRef<HTMLInputElement>(null), durationInput = useRef<HTMLInputElement>(null)
  const stations = useQuery({ queryKey: ['gaming-operations', 'board'], queryFn: () => gamingSessionApi.board(), enabled: !station })
  const options = stations.data?.stations.filter((value) => value.allowedActions.includes('START')) ?? []
  const locked = busy || !!retryRequest
  useDirtyGuard(locked || !!selected, { pending: locked })
  async function start(event: FormEvent) {
    event.preventDefault()
    if (!selected || !resourceId || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    const request = retryRequest ?? { customerId: selected.id, resourceId, durationMinutes: duration, reservationId: reservation?.id }
    try {
      await gamingSessionApi.start(request, key.current.begin()); key.current.succeeded()
      void client.invalidateQueries({ queryKey: ['gaming-operations'] })
      void client.invalidateQueries({ queryKey: ['gaming-visits'] })
      onStarted?.(); onClose()
    } catch (cause) {
      key.current.failed(cause); setRetryRequest(key.current.pendingKey() ? request : null)
      setError(apiErrorMessage(cause, 'Sesiju nije moguće pokrenuti.'))
      void client.invalidateQueries({ queryKey: ['gaming-operations'] })
    } finally { inFlight.current = false; setBusy(false) }
  }
  if (creating) return <CustomerFormDialog onClose={() => setCreating(false)}
    onSaved={() => { void client.invalidateQueries({ queryKey: ['customers'] }) }}
    onContinue={value => { setSelected(value); setCreating(false) }} />
  return <Modal open closeDisabled={locked} title={`Pokreni sesiju${station ? ` · ${station.resourceName}` : ''}`} onClose={() => { if (!locked) onClose() }} initialFocusRef={customer ? durationInput : input}>
    <form className="ui-form-grid form-grid start-session-form" onSubmit={start}>
      {error && <Alert tone="danger" role="alert">{error}{retryRequest && ' Ponovnim pokušajem proverava se ista komanda.'}</Alert>}
      {customer ? <p className="selected-customer"><strong>{customer.name}</strong><span>{customer.email}</span></p> : <CustomerSearch selected={selected} onSelect={value=>{setSelected(value);durationInput.current?.focus()}} inputRef={input} disabled={locked}
        onCreate={hasCapability(actor, 'CUSTOMER_CREATE') ? () => setCreating(true) : undefined} />}

      {!station && <>{stations.isLoading ? <Skeleton lines={2} label="Učitavanje stanica" /> : stations.error ? <ErrorState message="Stanice nisu dostupne."
        action={<Button variant="secondary" type="button" onClick={() => stations.refetch()}>Pokušaj ponovo</Button>} /> : !options.length ? <EmptyState title="Nema slobodnih stanica" description="Gaming operativa prikazuje zauzete stanice i potrebne recovery akcije." /> :
        <label>Slobodna stanica<Select aria-label={"Slobodna stanica"} required disabled={locked || !!reservation} value={resourceId} onChange={(event) => setResourceId(event.target.value)}>
          <option value="">Izaberite stanicu</option>{options.map((value) => <option key={value.resourceId} value={value.resourceId}>{value.resourceName} · {value.applicationProfileName ?? value.resourceCode}</option>)}</Select></label>}</>}
      <fieldset className="duration-presets"><legend>Trajanje</legend><div className="ui-actions form-actions">{[30, 60, 120, 180].map((value) =>
        <Button type="button" key={value} disabled={locked} variant={duration === value ? 'primary' : 'secondary'} aria-pressed={duration === value} onClick={() => setDuration(value)}>{value} min</Button>)}</div></fieldset>
      <label htmlFor="gaming-duration">Trajanje u minutima<Input aria-label={"Trajanje u minutima"} ref={durationInput} id="gaming-duration" type="number" required min={15} max={480} disabled={locked} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
      <p className="search-help">{selected ? `${selected.name} · ` : ''}{station?.resourceName ?? options.find((value) => value.resourceId === resourceId)?.resourceName ?? 'Izaberite stanicu'} · {duration} min</p>
      <Button type="submit" loading={busy} disabled={!selected || !resourceId}>{retryRequest ? 'Pokušaj ponovo' : `Pokreni za ${selected?.name ?? 'izabranog klijenta'}`}</Button>
    </form>
  </Modal>
}
