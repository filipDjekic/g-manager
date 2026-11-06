import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { CustomerSearch, type CustomerChoice } from '../customers/CustomerSearch'
import { CustomerFormDialog } from '../customers/CustomerFormDialog'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { gamingTimeApi } from '../api/gamingTimeApi'
import { Button, EmptyState, Modal, Select, Alert } from '../components/ui'
import type { GamingStationCard } from '../types/gamingSession.types'
import { useFinancialCommand } from './useFinancialCommand'
import { remaining, stationLabels } from './presentation'
export function StartSessionDialog({ station, customer, onClose, onStarted, reservation }: {
  station?: GamingStationCard; customer?: CustomerChoice; onClose: () => void; onStarted?: () => void; reservation?: { id: string; resourceId: string; durationMinutes?: number }
}) {
  const actor = useAuthStore(s => s.user), input = useRef<HTMLInputElement>(null)
  const [creating, setCreating] = useState(false), [selected, setSelected] = useState<CustomerChoice | null>(customer ?? null)
  const [resourceId, setResourceId] = useState(station?.resourceId ?? reservation?.resourceId ?? '')
  const command = useFinancialCommand(() => { onStarted?.(); onClose() })
  const stations = useQuery({ queryKey: ['gaming-operations', 'board'], queryFn: () => gamingSessionApi.board(), enabled: !station })
  const options = stations.data?.stations.filter(s => s.allowedActions.includes('START')) ?? []
  const wallet = useQuery({ queryKey: ['gaming-time', selected?.id], queryFn: () => gamingTimeApi.account(selected!.id), enabled: !!selected, refetchInterval: 5000 })
  if (creating) return <CustomerFormDialog onClose={() => setCreating(false)} onSaved={() => {}} onContinue={value => { setSelected(value); setCreating(false) }} />
  return <Modal open closeDisabled={command.locked} title="Dodeli računar" onClose={onClose} initialFocusRef={input}>
    <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); if (!selected || !resourceId) return; const body = { customerId: selected.id, resourceId, reservationId: reservation?.id }; void command.run(key => gamingTimeApi.assign(body, key)) }}>
      {command.feedback}{customer ? <p><strong>{customer.name}</strong> {customer.email}</p> : <CustomerSearch selected={selected} onSelect={setSelected} inputRef={input} disabled={command.locked} onCreate={hasCapability(actor, 'CUSTOMER_CREATE') ? () => setCreating(true) : undefined} />}
      {wallet.error && <Alert tone="danger">Saldo nije dostupan.</Alert>}
      {wallet.data && <p>Raspoloživo vreme: <strong>{remaining(wallet.data.balanceSeconds)}</strong></p>}
      {station ? <p>{station.resourceName} — {stationLabels[station.status]}</p> : <label>Slobodna stanica<Select required disabled={command.locked || !!reservation} value={resourceId} onChange={e => setResourceId(e.target.value)}><option value="">Izaberite stanicu</option>{options.map(s => <option key={s.resourceId} value={s.resourceId}>{s.resourceName} — {stationLabels[s.status]}</option>)}</Select></label>}
      {!station && !stations.isLoading && !options.length && <EmptyState title="Nema slobodnih stanica" />}
      <p>Računar čeka prijavu najviše 5 minuta. Odbrojavanje počinje tek posle uspešne prijave na Windows Client. Dodela ne troši saldo.</p>
      <Button type="submit" loading={command.busy} disabled={command.locked || !selected || !resourceId || !wallet.data || wallet.data.balanceSeconds <= 0}>Dodeli računar</Button>
    </form>
  </Modal>
}
