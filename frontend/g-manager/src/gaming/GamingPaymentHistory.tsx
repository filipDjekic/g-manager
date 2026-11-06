import { useState } from 'react'
import { gamingTimeApi, type ManualPayment } from '../api/gamingTimeApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Alert, Button, Modal, Pagination, Select, Skeleton } from '../components/ui'
import { usePagedQuery } from '../query/usePagedQuery'
import { formatBusinessDateTime } from '../reservations/dateTime'
import { remaining } from './presentation'

const kinds: Record<string, string> = { TIME_GRANT: 'Uplata', TIME_REFUND: 'Povraćaj' }
export function GamingPaymentHistory({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<'transactions' | 'historical-transactions'>('transactions')
  const allowed = hasCapability(useAuthStore(s => s.user), 'GAMING_PAYMENT_RECORD')
  const payments = usePagedQuery(['gaming-time', customerId, history], (p, s) => gamingTimeApi.history<ManualPayment>(customerId, history, p, s), 10, open && allowed)
  if (!allowed) return null
  return <><Button variant="secondary" onClick={() => setOpen(true)}>Istorija uplata</Button>
    {open && <Modal open title="Istorija uplata" onClose={() => setOpen(false)}>
      <label>Evidencija<Select value={history} onChange={e => setHistory(e.target.value === 'historical-transactions' ? 'historical-transactions' : 'transactions')}>
        <option value="transactions">Uplate gaming vremena</option><option value="historical-transactions">Istorijska arhiva</option>
      </Select></label>
      {history === 'historical-transactions' && <p>Sačuvana ranija evidencija. Iznosi nisu uključeni u aktuelne uplate i ne predstavljaju raspoloživo gaming vreme.</p>}
      {payments.isLoading && <Skeleton lines={3} />}
      {payments.error && <Alert tone="danger">Istorija nije dostupna. <Button onClick={() => void payments.refetch()}>Osveži</Button></Alert>}
      {payments.data && <><ul>{payments.data.content.map(p => <li key={p.id}>
        {formatBusinessDateTime(p.created_at)} · {history === 'transactions' ? kinds[p.kind] ?? 'Uplata vremena' : `Istorijska transakcija (${p.kind})`} · {p.amount} RSD
        {p.method === 'CASH' ? ' · Gotovina' : p.method === 'EXTERNAL_POS' ? ' · Spoljni POS' : ''}{p.reference ? ` · ${p.reference}` : ''}
        {p.granted_seconds ? ` · ${remaining(p.granted_seconds)}` : ''}{p.reason ? ` · ${p.reason}` : ''}
      </li>)}</ul>{!payments.data.content.length && <p>Nema uplata.</p>}
        <Pagination page={payments.page} onPageChange={payments.setPage} totalPages={payments.data.totalPages} totalElements={payments.data.totalElements} pageSize={10} loading={payments.isFetching} />
      </>}
    </Modal>}
  </>
}
