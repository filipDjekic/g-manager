import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { resourceApi } from '../api/resourceApi'
import { reservationApi } from '../api/reservationApi'
import { ActionDialog } from '../components/ui/ActionDialog'
import { Button, Drawer, ErrorState, Skeleton } from '../components/ui'
import { queryKeys } from '../query/queryKeys'
import { ReservationEditForm } from './ReservationEditForm'
import { formatBusinessDateTime } from './dateTime'
import type { ReservationStatus } from '../types/reservation.types'

const labels: Record<ReservationStatus, string> = {
  PENDING: 'Na čekanju', CONFIRMED: 'Potvrđena', REJECTED: 'Odbijena',
  CANCELLED: 'Otkazana', COMPLETED: 'Završena',
}
const actionLabels: Partial<Record<ReservationStatus, string>> = {
  CONFIRMED: 'Potvrdi', REJECTED: 'Odbij', CANCELLED: 'Otkaži', COMPLETED: 'Završi',
}

type ReservationDetailsProps = {
  reservationId: string | null
  onClose: () => void
  onChanged?: () => void | Promise<void>
}
export function ReservationDetailsDrawer(props: ReservationDetailsProps) {
  return <ReservationDetailsContent key={props.reservationId??'closed'} {...props}/>
}
function ReservationDetailsContent({ reservationId, onClose, onChanged }: ReservationDetailsProps) {
  const client = useQueryClient()
  const [action, setAction] = useState<ReservationStatus | null>(null)
  const [editId,setEditId]=useState<string|null>(null)
  const detail = useQuery({
    queryKey: queryKeys.reservationDetail(reservationId ?? ''),
    queryFn: () => reservationApi.detail(reservationId!),
    enabled: Boolean(reservationId),refetchInterval:15000,
  })
  const transition = useMutation({
    mutationFn: ({ next, note }: { next: ReservationStatus; note?: string }) => {
      const value = detail.error ? undefined : detail.data!
      if(!value.allowedActions.includes(next))throw new Error('Ovlašćenje za ovu akciju više nije dostupno.')
      return reservationApi.changeStatus(value, next, note)
    },
    onSuccess: async () => {
      setAction(null)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['reservations'] }),
        Promise.resolve(onChanged?.()),
      ])
    },
    onError: async () => { setAction(null); await Promise.all([detail.refetch(),client.invalidateQueries({queryKey:['reservations']})]) },
  })
  const [resourceChoice, setResourceChoice] = useState<{ reservationId: string; resourceId: string } | null>(null)
  const value = detail.error ? undefined : detail.data
  const resourceId = resourceChoice?.reservationId === reservationId ? resourceChoice.resourceId : ''
  const resourceOptions = useQuery({
    queryKey: ['reservation-resource-options', reservationId, value?.serviceId, value?.startTime, value?.endTime],
    queryFn: () => resourceApi.bookingOptions({ serviceId: value!.serviceId!, start: value!.startTime, end: value!.endTime }),
    enabled: Boolean(value?.serviceId && value?.resourceRequired && value?.canAssignResource), retry: false,
  })
  const assign = useMutation({
    mutationFn: () => reservationApi.assignResource(detail.data!, resourceId),
    onSuccess: async () => {
      setResourceChoice(null)
      await Promise.all([client.invalidateQueries({ queryKey: ['reservations'] }), Promise.resolve(onChanged?.())])
    },
    onError: async () => { await Promise.all([detail.refetch(),resourceOptions.refetch()]) },
  })
  const title = value ? `${value.serviceName} · ${formatBusinessDateTime(value.startTime)}` : 'Detalji rezervacije'
  return <>
    <Drawer open={Boolean(reservationId)} title={title} onClose={onClose}>
      {detail.isLoading && <Skeleton lines={7} label="Učitavanje detalja rezervacije" />}
      {detail.error && <ErrorState message={apiErrorMessage(detail.error, 'Detalje rezervacije nije moguće učitati.')}
        action={<Button onClick={() => detail.refetch()}>Pokušaj ponovo</Button>} />}
      {value && <div className="reservation-detail">
        <span className="status-badge neutral">{labels[value.status]}</span>
        {value.readOnly&&<p className="reservation-readonly-notice" role="status">Nemate ovlašćenje za upravljanje rezervacijama ove stanice.</p>}
        <dl>
          <div><dt>Klijent</dt><dd>{value.customerName}</dd></div>
          {value.customerContact && <div><dt>Kontakt</dt><dd>{value.customerContact}</dd></div>}
          <div><dt>Usluga</dt><dd>{value.serviceName}</dd></div>
          <div><dt>Zaposleni</dt><dd>{value.employeeName}</dd></div>
          <div><dt>Lokacija</dt><dd>{value.locationName || 'Lokacija nije dodeljena'}</dd></div>
          <div><dt>Računar / resurs</dt><dd>{value.resourceId
            ? `${value.resourceCode} · ${value.resourceName}`
            : value.resourceRequired ? 'Obavezni resurs nije dodeljen' : 'Usluga ne zahteva resurs'}</dd></div>
          <div><dt>Početak</dt><dd>{formatBusinessDateTime(value.startTime)}</dd></div>
          <div><dt>Kraj</dt><dd>{formatBusinessDateTime(value.endTime)}</dd></div>
          <div><dt>Trajanje</dt><dd>{value.durationMinutes ?? 'N/D'} min</dd></div>
          {!value.readOnly&&<div><dt>Napomena</dt><dd>{value.note || 'Nema napomene'}</dd></div>}
          <div><dt>Kreirano</dt><dd>{formatBusinessDateTime(value.createdAt)}</dd></div>
          <div><dt>Izmenjeno</dt><dd>{formatBusinessDateTime(value.updatedAt)}</dd></div>
        </dl>
        {value.resourceRequired && !value.resourceId && <section>
          <p className="error-banner" role="alert">Rezervacija nema zahtevan fizički resurs. Potrebna je ručna dodela; potvrđivanje nije dozvoljeno.</p>
          {value.canAssignResource && <>
            {resourceOptions.isLoading && <Skeleton lines={2} label="Učitavanje slobodnih resursa" />}
            {resourceOptions.error && <ErrorState message={apiErrorMessage(resourceOptions.error, 'Slobodne resurse nije moguće učitati.')}
              action={<Button onClick={() => resourceOptions.refetch()}>Pokušaj ponovo</Button>} />}
            <label>Slobodan računar / resurs<select value={resourceId} onChange={(event) =>
              setResourceChoice({ reservationId: value.id, resourceId: event.target.value })}>
              <option value="">Izaberite konkretan resurs</option>
              {resourceOptions.data?.resources.map((resource) => <option key={resource.id} value={resource.id} disabled={!resource.available}>
                {resource.code} · {resource.name} · {resource.locationName}{resource.available ? '' : ' — Zauzet ili van radnog vremena'}</option>)}
            </select></label>
            {!resourceOptions.isLoading && !resourceOptions.error && !resourceOptions.data?.resources.some((resource) => resource.available)
              && <p>Nema slobodnog kompatibilnog resursa za ovaj termin. Rezervaciju možete otkazati.</p>}
            <Button type="button" loading={assign.isPending}
              disabled={resourceOptions.isFetching || !resourceOptions.data?.resources.some((resource) => resource.id === resourceId && resource.available)}
              onClick={() => assign.mutate()}>Dodeli resurs</Button>
            {assign.error && <p role="alert" className="error-banner">{apiErrorMessage(assign.error, 'Resurs nije moguće dodeliti.')}</p>}
          </>}
        </section>}
        {value.canEdit&&!value.readOnly&&<>
          {editId===value.id?<ReservationEditForm key={`${value.id}:${value.version}`} value={value} onClose={()=>setEditId(null)} onChanged={async()=>{
            await Promise.all([client.invalidateQueries({queryKey:['reservations']}),detail.refetch(),Promise.resolve(onChanged?.())])
          }}/>:<Button variant="secondary" onClick={()=>setEditId(value.id)}>Izmeni vreme ili stanicu</Button>}
        </>}
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
    <ActionDialog open={Boolean(action&&value?.allowedActions.includes(action))} title={`${action ? actionLabels[action] : ''} rezervaciju`}
      description="Promena će odmah biti sačuvana i evidentirana."
      confirmLabel={action ? actionLabels[action] ?? 'Potvrdi' : 'Potvrdi'}
      reasonLabel={action === 'REJECTED' || action === 'CANCELLED' ? 'Razlog' : undefined}
      reasonRequired={action === 'REJECTED' || action === 'CANCELLED'}
      danger={action === 'REJECTED' || action === 'CANCELLED'} loading={transition.isPending}
      onClose={() => setAction(null)} onConfirm={(note) => action && value?.allowedActions.includes(action) && transition.mutate({ next: action, note })} />
    {transition.error && <p className="error-banner" role="alert">
      {apiErrorMessage(transition.error, 'Status rezervacije nije moguće promeniti.')}</p>}
  </>
}
