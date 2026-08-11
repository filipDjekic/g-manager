import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { isConflictResponse } from '../api/idempotency'
import { reservationApi } from '../api/reservationApi'
import { ActionDialog } from '../components/ui/ActionDialog'
import { Button, Drawer, ErrorState, Skeleton } from '../components/ui'
import { queryKeys } from '../query/queryKeys'
import { formatBusinessDateTime } from './dateTime'
import type { ReservationStatus } from '../types/reservation.types'

const labels: Record<ReservationStatus, string> = {
  PENDING: 'Na čekanju', CONFIRMED: 'Potvrđena', REJECTED: 'Odbijena',
  CANCELLED: 'Otkazana', COMPLETED: 'Završena',
}
const actionLabels: Partial<Record<ReservationStatus, string>> = {
  CONFIRMED: 'Potvrdi', REJECTED: 'Odbij', CANCELLED: 'Otkaži', COMPLETED: 'Završi',
}

export function ReservationDetailsDrawer({ reservationId, onClose, onChanged }: {
  reservationId: string | null
  onClose: () => void
  onChanged?: () => void | Promise<void>
}) {
  const client = useQueryClient()
  const [action, setAction] = useState<ReservationStatus | null>(null)
  const detail = useQuery({
    queryKey: queryKeys.reservationDetail(reservationId ?? ''),
    queryFn: () => reservationApi.detail(reservationId!),
    enabled: Boolean(reservationId),
  })
  const transition = useMutation({
    mutationFn: ({ next, note }: { next: ReservationStatus; note?: string }) => {
      const value = detail.data!
      return reservationApi.changeStatus(value, next, note)
    },
    onSuccess: async () => {
      setAction(null)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['reservations'] }),
        Promise.resolve(onChanged?.()),
      ])
    },
    onError: async (error) => {
      if (isConflictResponse(error)) await detail.refetch()
    },
  })
  const value = detail.data
  const title = value ? `${value.serviceName} · ${formatBusinessDateTime(value.startTime)}` : 'Detalji rezervacije'
  return <>
    <Drawer open={Boolean(reservationId)} title={title} onClose={onClose}>
      {detail.isLoading && <Skeleton lines={7} label="Učitavanje detalja rezervacije" />}
      {detail.error && <ErrorState message={apiErrorMessage(detail.error, 'Detalje rezervacije nije moguće učitati.')}
        action={<Button onClick={() => detail.refetch()}>Pokušaj ponovo</Button>} />}
      {value && <div className="reservation-detail">
        <span className="status-badge neutral">{labels[value.status]}</span>
        <dl>
          <div><dt>Klijent</dt><dd>{value.customerName}</dd></div>
          {value.customerContact && <div><dt>Kontakt</dt><dd>{value.customerContact}</dd></div>}
          <div><dt>Usluga</dt><dd>{value.serviceName}</dd></div>
          <div><dt>Zaposleni</dt><dd>{value.employeeName}</dd></div>
          <div><dt>Početak</dt><dd>{formatBusinessDateTime(value.startTime)}</dd></div>
          <div><dt>Kraj</dt><dd>{formatBusinessDateTime(value.endTime)}</dd></div>
          <div><dt>Trajanje</dt><dd>{value.durationMinutes ?? 'N/D'} min</dd></div>
          <div><dt>Napomena</dt><dd>{value.note || 'Nema napomene'}</dd></div>
          <div><dt>Kreirano</dt><dd>{formatBusinessDateTime(value.createdAt)}</dd></div>
          <div><dt>Izmenjeno</dt><dd>{formatBusinessDateTime(value.updatedAt)}</dd></div>
        </dl>
        {value.history.length > 0 && <section><h3>Istorija</h3><ol className="reservation-history">
          {value.history.map((item) => <li key={`${item.fromStatus}-${item.toStatus}-${item.occurredAt}`}>
            {labels[item.fromStatus]} → {labels[item.toStatus]} · {formatBusinessDateTime(item.occurredAt)}
            {item.reason && <span> · Razlog: {item.reason}</span>}</li>)}
        </ol></section>}
        {value.allowedActions.length > 0 && <div className="card-actions">
          {value.allowedActions.map((next) => <Button type="button" key={next}
            variant={next === 'REJECTED' || next === 'CANCELLED' ? 'danger' : 'primary'}
            onClick={() => setAction(next)}>{actionLabels[next]}</Button>)}
        </div>}
      </div>}
    </Drawer>
    <ActionDialog open={Boolean(action)} title={`${action ? actionLabels[action] : ''} rezervaciju`}
      description="Promena će odmah biti sačuvana i evidentirana."
      confirmLabel={action ? actionLabels[action] ?? 'Potvrdi' : 'Potvrdi'}
      reasonLabel={action === 'REJECTED' || action === 'CANCELLED' ? 'Razlog' : undefined}
      reasonRequired={action === 'REJECTED' || action === 'CANCELLED'}
      danger={action === 'REJECTED' || action === 'CANCELLED'} loading={transition.isPending}
      onClose={() => setAction(null)} onConfirm={(note) => action && transition.mutate({ next: action, note })} />
    {transition.error && <p className="error-banner" role="alert">
      {apiErrorMessage(transition.error, 'Status rezervacije nije moguće promeniti.')}</p>}
  </>
}
