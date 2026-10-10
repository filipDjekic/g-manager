import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { apiErrorMessage } from '../api/client'
import { resourceApi } from '../api/resourceApi'
import { reservationApi } from '../api/reservationApi'
import { ActionDialog } from '../components/ui/ActionDialog'
import { Badge, Button, Drawer, ErrorState, Modal, Skeleton } from '../components/ui'
import { reservationLabels as labels, reservationTones } from '../components/ui/statusPresentation'
import { queryKeys } from '../query/queryKeys'
import { ReservationEditForm } from './ReservationEditForm'
import { formatBusinessDateTime as formatDateTime, formatBusinessIntervalEnd, formatBusinessTime } from './dateTime'
import type { ReservationDetailAction, ReservationStatus } from '../types/reservation.types'
import { ReservationIcon, reservationActionLabels as actionLabels } from './ReservationIcon'
import './reservations.css'

type ReservationDetailsProps = {
  reservationId: string | null
  onClose: () => void
  onChanged?: () => void | Promise<void>
  initialAction?: ReservationDetailAction
  appearance?: 'operations' | 'calendar'
  areaNames?: Record<string,string>
  returnFocusRef?: RefObject<HTMLElement | null>
}
export function ReservationDetailsDrawer(props: ReservationDetailsProps) {
  return <ReservationDetailsContent key={props.reservationId??'closed'} {...props}/>
}
function ReservationDetailsContent({ reservationId, onClose, onChanged, initialAction, appearance, areaNames, returnFocusRef }: ReservationDetailsProps) {
  const isCalendar = appearance === 'calendar'
  const formatBusinessDateTime = (instant: string) => formatDateTime(instant, false, appearance ? 'sr-Latn-RS' : 'sr-RS')
  const client = useQueryClient()
  const [action, setAction] = useState<ReservationStatus | null>(null)
  const [editId,setEditId]=useState<string|null>(null)
  const [editBusy,setEditBusy]=useState(false)
  const [expanded,setExpanded]=useState(false)
  const [requestedAction, setRequestedAction] = useState(initialAction)
  const assignment = useRef<HTMLElement>(null)
  const editSection = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isCalendar || !editId) return
    editSection.current?.scrollIntoView({block:'nearest'})
    editSection.current?.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true})
  },[isCalendar,editId])
  const detail = useQuery({
    queryKey: queryKeys.reservationDetail(reservationId ?? ''),
    queryFn: () => reservationApi.detail(reservationId!),
    enabled: Boolean(reservationId),refetchInterval:15000,
  })
  const transition = useMutation({
    mutationFn: ({ next, note }: { next: ReservationStatus; note?: string }) => {
      const value = detail.error ? undefined : detail.data
      if(!value || !value.allowedActions.includes(next))throw new Error('Ovlašćenje za ovu akciju više nije dostupno.')
      return reservationApi.changeStatus(value, next, note)
    },
    onSuccess: async () => {
      setAction(null)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['reservations'] }),
        Promise.resolve(onChanged?.()),
      ])
    },
    onError: async () => { await Promise.all([detail.refetch(),client.invalidateQueries({queryKey:['reservations']})]) },
  })
  const [resourceChoice, setResourceChoice] = useState<{ reservationId: string; resourceId: string } | null>(null)
  const value = detail.error ? undefined : detail.data
  useEffect(() => {
    if (!requestedAction || !value || detail.isFetching) return
    if (!value.readOnly) {
      if (requestedAction === 'EDIT' && value.canEdit) setEditId(value.id)
      else if (requestedAction === 'ASSIGN_RESOURCE' && value.canAssignResource) {
        assignment.current?.scrollIntoView({ block: 'nearest' }); assignment.current?.focus({ preventScroll: true })
      } else if (requestedAction !== 'EDIT' && requestedAction !== 'ASSIGN_RESOURCE' && value.allowedActions.includes(requestedAction)) setAction(requestedAction)
    }
    setRequestedAction(undefined)
  }, [requestedAction, value, detail.isFetching])
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
  const busy = transition.isPending || assign.isPending || editBusy
  const content = <>
      {detail.isLoading && <Skeleton lines={7} label="Učitavanje detalja rezervacije" />}
      {detail.error && <ErrorState message={apiErrorMessage(detail.error, 'Detalje rezervacije nije moguće učitati.')}
        action={<Button onClick={() => detail.refetch()}>Pokušaj ponovo</Button>} />}
      {isCalendar && transition.error && <ErrorState message={apiErrorMessage(transition.error, 'Status rezervacije nije moguće promeniti.')}/>}
      {value && <div className={`reservation-detail${isCalendar ? ` gm-calendar-status-${value.status.toLowerCase()}` : ''}`}>
        <Badge tone={reservationTones[value.status]}>{labels[value.status]}</Badge>
        {value.readOnly&&<p className="reservation-readonly-notice" role="status">Nemate ovlašćenje za upravljanje rezervacijama ove stanice.</p>}
        <dl>
          <div><dt>Klijent</dt><dd>{value.customerName}</dd></div>
          {value.customerContact && <div><dt>Kontakt</dt><dd>{value.customerContact}</dd></div>}
          <div><dt>Usluga</dt><dd>{value.serviceName}</dd></div>
          <div><dt>Zaposleni</dt><dd>{value.employeeName}</dd></div>
          <div><dt>{isCalendar ? 'Lokal' : 'Lokacija'}</dt><dd>{value.locationName || 'Lokacija nije dodeljena'}</dd></div>
          {isCalendar && value.resourceId && areaNames?.[value.resourceId] && <div><dt>Zona</dt><dd>{areaNames[value.resourceId]}</dd></div>}
          <div><dt>Računar / resurs</dt><dd>{value.resourceId
            ? `${value.resourceCode} · ${value.resourceName}`
            : value.resourceRequired ? 'Obavezni resurs nije dodeljen' : 'Usluga ne zahteva resurs'}</dd></div>
          {isCalendar && <div><dt>Datum</dt><dd>{new Intl.DateTimeFormat('sr-Latn-RS',{timeZone:'Europe/Belgrade',dateStyle:'long'}).format(new Date(value.startTime))}</dd></div>}
          <div><dt>Početak</dt><dd>{isCalendar ? formatBusinessTime(value.startTime) : formatBusinessDateTime(value.startTime)}</dd></div>
          <div><dt>Kraj</dt><dd>{isCalendar ? formatBusinessIntervalEnd(value.startTime,value.endTime,'sr-Latn-RS') : formatBusinessDateTime(value.endTime)}</dd></div>
          <div><dt>Trajanje</dt><dd>{value.durationMinutes ?? Math.round((Date.parse(value.endTime) - Date.parse(value.startTime)) / 60000)} min</dd></div>
          {!value.readOnly&&<div><dt>Napomena</dt><dd>{value.note || 'Nema napomene'}</dd></div>}
          {(!isCalendar || expanded) && <><div><dt>Kreirano</dt><dd>{formatBusinessDateTime(value.createdAt)}</dd></div>
          <div><dt>Izmenjeno</dt><dd>{formatBusinessDateTime(value.updatedAt)}</dd></div></>}
        </dl>
        {value.resourceRequired && !value.resourceId && <section ref={assignment} tabIndex={-1} className="reservation-resource-assignment">
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
          {editId===value.id?<div ref={editSection}><ReservationEditForm key={`${value.id}:${value.version}`} value={value} locale={appearance ? 'sr-Latn-RS' : 'sr-RS'} onBusyChange={setEditBusy} onClose={()=>setEditId(null)} onChanged={async()=>{
            await Promise.all([client.invalidateQueries({queryKey:['reservations']}),detail.refetch(),Promise.resolve(onChanged?.())])
          }}/></div>:!isCalendar && <Button variant="secondary" onClick={()=>setEditId(value.id)}>Izmeni vreme ili stanicu</Button>}
        </>}
        {value.history.length > 0 && (!isCalendar || expanded) && <section><h3>Istorija</h3><ol className="reservation-history">
          {value.history.map((item) => <li key={`${item.fromStatus}-${item.toStatus}-${item.occurredAt}`}>
            {labels[item.fromStatus]} → {labels[item.toStatus]} · {formatBusinessDateTime(item.occurredAt)}
            {item.reason && <span> · Razlog: {item.reason}</span>}</li>)}
        </ol></section>}
        {value.allowedActions.length > 0 && (!isCalendar || expanded) && <div className="card-actions">
          {value.allowedActions.map((next) => <Button type="button" key={next}
            disabled={transition.isPending || assign.isPending || editBusy}
            variant={next === 'REJECTED' || next === 'CANCELLED' ? 'danger' : 'primary'}
            onClick={() => setAction(next)}>{actionLabels[next]}</Button>)}
        </div>}
      </div>}
    </>
  return <>
    {isCalendar ? <Modal open={Boolean(reservationId)} title="Pregled rezervacije" titleIcon={<ReservationIcon/>} className="gm-calendar-detail"
      onClose={onClose} returnFocusRef={returnFocusRef} closeDisabled={busy} footer={value && <div className="dialog-actions gm-calendar-detail-actions">
        {value.canEdit && !value.readOnly && <Button type="button" variant="secondary" disabled={busy || detail.isFetching || editId===value.id} onClick={()=>setEditId(value.id)}>Izmeni</Button>}
        {!value.readOnly && value.allowedActions.includes('CANCELLED') && <Button type="button" variant="danger" disabled={busy || detail.isFetching} onClick={()=>setAction('CANCELLED')}>Otkaži</Button>}
        <Button type="button" variant="secondary" disabled={busy} aria-expanded={expanded} onClick={()=>setExpanded(current=>!current)}>{expanded?'Sažeti pregled':'Pogledaj detalje'}</Button>
      </div>}>{content}</Modal> : <Drawer size="wide" open={Boolean(reservationId)} title={title} onClose={onClose} returnFocusRef={returnFocusRef}
      className={appearance === 'operations' ? 'reservation-detail-drawer' : ''} closeDisabled={busy}>{content}</Drawer>}
    <ActionDialog open={Boolean(action)} disabled={!action || !value?.allowedActions.includes(action)} title={`${action ? actionLabels[action] : ''} rezervaciju`}
      description="Promena će odmah biti sačuvana i evidentirana."
      confirmLabel={action ? actionLabels[action] ?? 'Potvrdi' : 'Potvrdi'}
      reasonLabel={action === 'REJECTED' || action === 'CANCELLED' ? 'Razlog' : undefined}
      reasonRequired={action === 'REJECTED' || action === 'CANCELLED'}
      danger={action === 'REJECTED' || action === 'CANCELLED'} loading={transition.isPending}
      onClose={() => setAction(null)} onConfirm={async (note) => {
        if (action && value?.allowedActions.includes(action)) await transition.mutateAsync({ next: action, note })
      }} />
    {!isCalendar && transition.error && <p className="error-banner" role="alert">
      {apiErrorMessage(transition.error, 'Status rezervacije nije moguće promeniti.')}</p>}
  </>
}
