import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { customerApi } from '../api/customerApi'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { apiErrorMessage } from '../api/client'
import { IdempotencyKeyManager } from '../api/idempotency'
import { Button, EmptyState, ErrorState, Modal, Skeleton } from '../components/ui'
import type { GamingStationCard, StartGamingSessionInput } from '../types/gamingSession.types'

type CustomerChoice = { id: string; name: string; email?: string }
export function StartSessionDialog({ station, customer, onClose, onStarted }: {
  station?: GamingStationCard; customer?: CustomerChoice; onClose: () => void; onStarted?: () => void
}) {
  const client = useQueryClient()
  const [search, setSearch] = useState(''), [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<CustomerChoice | null>(customer ?? null)
  const [resourceId, setResourceId] = useState(station?.resourceId ?? '')
  const [duration, setDuration] = useState(120), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [retryRequest, setRetryRequest] = useState<StartGamingSessionInput | null>(null)
  const inFlight = useRef(false), key = useRef(new IdempotencyKeyManager()), input = useRef<HTMLInputElement>(null)
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(search.trim()), 250); return () => window.clearTimeout(timer) }, [search])
  const customers = useQuery({ queryKey: ['gaming-customer-search', debounced],
    queryFn: () => customerApi.list({ search: debounced || undefined, active: true, page: 0, size: 8 }), enabled: !customer })
  const stations = useQuery({ queryKey: ['gaming-operations', 'board'], queryFn: () => gamingSessionApi.board(), enabled: !station })
  const options = stations.data?.stations.filter((value) => value.allowedActions.includes('START')) ?? []
  const locked = busy || !!retryRequest
  async function start(event: FormEvent) {
    event.preventDefault()
    if (!selected || !resourceId || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    const request = retryRequest ?? { customerId: selected.id, resourceId, durationMinutes: duration }
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
  return <Modal open closeDisabled={busy} title={`Pokreni sesiju${station ? ` · ${station.resourceName}` : ''}`} onClose={() => { if (!busy) onClose() }} initialFocusRef={input}>
    <form className="form-grid start-session-form" onSubmit={start}>
      {error && <p className="error-banner" role="alert">{error}{retryRequest && ' Ponovnim pokušajem proverava se ista komanda.'}</p>}
      {customer ? <p className="selected-customer"><strong>{customer.name}</strong><span>{customer.email}</span></p> : <>
        <label htmlFor="gaming-customer-search">Brza pretraga klijenta<input ref={input} id="gaming-customer-search" disabled={locked} value={search}
          placeholder="Ime ili email" onChange={(event) => { setSearch(event.target.value); setSelected(null) }} /></label>
        {customers.isLoading ? <Skeleton lines={2} label="Pretraga klijenata" /> : customers.error ? <ErrorState message="Pretraga klijenata nije dostupna."
          action={<Button type="button" onClick={() => customers.refetch()}>Pokušaj ponovo</Button>} /> : !customers.data?.content.length ? <EmptyState title="Nema aktivnih klijenata" description="Promenite pretragu ili kreirajte klijenta u odeljku Klijenti." /> :
          <div className="gaming-customer-results" role="group" aria-label="Izbor klijenta">{customers.data.content.map((value) =>
            <button type="button" disabled={locked} aria-pressed={selected?.id === value.id} className={selected?.id === value.id ? 'selected' : ''} key={value.id}
              onClick={() => setSelected(value)}><strong>{value.name}</strong><small>{value.email}</small></button>)}</div>}
      </>}
      {!station && <>{stations.isLoading ? <Skeleton lines={2} label="Učitavanje stanica" /> : stations.error ? <ErrorState message="Stanice nisu dostupne."
        action={<Button type="button" onClick={() => stations.refetch()}>Pokušaj ponovo</Button>} /> : !options.length ? <EmptyState title="Nema slobodnih stanica" description="Gaming operativa prikazuje zauzete stanice i potrebne recovery akcije." /> :
        <label>Slobodna stanica<select required disabled={locked} value={resourceId} onChange={(event) => setResourceId(event.target.value)}>
          <option value="">Izaberite stanicu</option>{options.map((value) => <option key={value.resourceId} value={value.resourceId}>{value.resourceName} · {value.applicationProfileName ?? value.resourceCode}</option>)}</select></label>}</>}
      <fieldset className="duration-presets"><legend>Trajanje</legend><div className="form-actions">{[30, 60, 120, 180].map((value) =>
        <Button type="button" key={value} disabled={locked} variant={duration === value ? 'primary' : 'secondary'} aria-pressed={duration === value} onClick={() => setDuration(value)}>{value} min</Button>)}</div></fieldset>
      <label htmlFor="gaming-duration">Trajanje u minutima<input id="gaming-duration" type="number" required min={15} max={480} disabled={locked} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
      <p className="search-help">{selected ? `${selected.name} · ` : ''}{station?.resourceName ?? options.find((value) => value.resourceId === resourceId)?.resourceName ?? 'Izaberite stanicu'} · {duration} min</p>
      <Button type="submit" loading={busy} disabled={!selected || !resourceId}>{retryRequest ? 'Pokušaj ponovo' : `Pokreni za ${selected?.name ?? 'izabranog klijenta'}`}</Button>
    </form>
  </Modal>
}
