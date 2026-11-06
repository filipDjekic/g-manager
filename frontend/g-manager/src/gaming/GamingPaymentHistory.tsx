import { useState } from 'react'
import { gamingTimeApi, type ManualPayment } from '../api/gamingTimeApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Alert, Button, Modal, Pagination, Skeleton } from '../components/ui'
import { usePagedQuery } from '../query/usePagedQuery'
import { formatBusinessDateTime } from '../reservations/dateTime'
import { remaining } from './presentation'

const kinds: Record<string, string> = { TIME_GRANT: 'Uplata', TIME_REFUND: 'Povraćaj', PAYMENT: 'Uplata', REFUND: 'Povraćaj', CREDIT_TOPUP: 'Ranija uplata', PACKAGE_SALE: 'Ranija kupovina vremena', CREDIT_CORRECTION: 'Ranija korekcija' }
export function GamingPaymentHistory({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false)
  const allowed = hasCapability(useAuthStore(s => s.user), 'GAMING_PAYMENT_RECORD')
  const payments = usePagedQuery(['gaming-time', customerId, 'transactions'], (p, s) => gamingTimeApi.history<ManualPayment>(customerId, 'transactions', p, s), 10, open && allowed)
  if (!allowed) return null
  return <><Button variant="secondary" onClick={() => setOpen(true)}>Istorija uplata</Button>
    {open && <Modal open title="Istorija uplata" onClose={() => setOpen(false)}>
      {payments.isLoading && <Skeleton lines={3} />}
      {payments.error && <Alert tone="danger">Istorija nije dostupna. <Button onClick={() => void payments.refetch()}>Osveži</Button></Alert>}
      {payments.data && <><ul>{payments.data.content.map(p => <li key={p.id}>
        {formatBusinessDateTime(p.created_at)} · {kinds[p.kind] ?? 'Ranija transakcija'} · {p.amount} RSD
        {p.granted_seconds ? ` · ${remaining(p.granted_seconds)}` : ''}{p.reason ? ` · ${p.reason}` : ''}
      </li>)}</ul>{!payments.data.content.length && <p>Nema uplata.</p>}
        <Pagination page={payments.page} onPageChange={payments.setPage} totalPages={payments.data.totalPages} totalElements={payments.data.totalElements} pageSize={10} loading={payments.isFetching} />
      </>}
    </Modal>}
  </>
}
