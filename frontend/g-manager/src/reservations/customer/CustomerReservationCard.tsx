import { useRef } from 'react'
import { Badge, Button } from '../../components/ui'
import { reservationLabels, reservationTones } from '../../components/ui/statusPresentation'
import { formatBusinessIntervalEnd, formatBusinessTime } from '../dateTime'
import type { CatalogItem } from '../../types/catalog.types'
import type { Reservation, ReservationDetailAction } from '../../types/reservation.types'
import { CustomerReservationIcon, ReservationServiceMedia } from './customerPresentation'
import { customerDate, customerDuration, useReservationArea } from './customerPresentation.model'

export function CustomerReservationCard({ value, service, disabled, canCreate, canChange, onDetails, onRebook }: {
  value: Reservation; service?: CatalogItem; disabled: boolean; canCreate: boolean; canChange: boolean
  onDetails: (value: Reservation, action?: ReservationDetailAction, trigger?: HTMLElement) => void; onRebook: (value: Reservation, trigger: HTMLElement) => void
}) {
  const titleRef = useRef<HTMLButtonElement>(null), area = useReservationArea(value.serviceId, value.resourceId)
  const minutes = Math.round((Date.parse(value.endTime) - Date.parse(value.startTime)) / 60000)
  const editable = value.canEdit && !value.readOnly && canChange
  const cancellable = value.allowedActions?.includes('CANCELLED') && !value.readOnly && canChange
  return <article className={`gm-my-reservation-card gm-my-reservation-status-${value.status.toLowerCase()}`} onClick={event => {
    if (!(event.target as Element).closest('button, a, input, label') && titleRef.current) onDetails(value, undefined, titleRef.current)
  }}>
    <div className="gm-my-reservation-card-main"><ReservationServiceMedia serviceId={value.serviceId} item={service} /><div className="gm-my-reservation-card-content">
      <Badge tone={reservationTones[value.status]}>{reservationLabels[value.status]}</Badge>
      <button ref={titleRef} type="button" className="gm-my-reservation-title" onClick={event => onDetails(value, undefined, event.currentTarget)}>{value.serviceName ?? service?.name ?? 'Usluga'}</button>
      <p className="gm-my-reservation-date">{customerDate(value.startTime)}</p>
      <p className="gm-my-reservation-time"><CustomerReservationIcon kind="clock" /><strong>{formatBusinessTime(value.startTime)} – {formatBusinessIntervalEnd(value.startTime, value.endTime, 'sr-Latn-RS')}</strong><span>{customerDuration(minutes)}</span></p>
      <p className="gm-my-reservation-place"><CustomerReservationIcon kind="pin" /><span>{value.locationName || 'Lokal nije dodeljen'}{area && <small>Zona: {area}</small>}</span></p>
      <p className="gm-my-reservation-place"><CustomerReservationIcon kind="monitor" /><span>{value.resourceId ? [value.resourceCode, value.resourceName].filter(Boolean).join(' · ') || 'Dodeljeni resurs' : value.resourceRequired ? 'Resurs još nije dodeljen' : 'Usluga ne zahteva fizički resurs'}</span></p>
    </div></div>
    {value.resourceRequired && !value.resourceId && <p className="gm-my-reservation-warning">Osoblje treba da dodeli resurs pre potvrđivanja rezervacije.</p>}
    <footer><Button type="button" variant="secondary" onClick={event => onDetails(value, undefined, event.currentTarget)}>Detalji</Button>
      {editable && <Button type="button" variant="secondary" disabled={disabled} onClick={event => onDetails(value, 'EDIT', event.currentTarget)}>Izmeni termin</Button>}
      {cancellable && <Button type="button" variant="danger" disabled={disabled} onClick={event => onDetails(value, 'CANCELLED', event.currentTarget)}>Otkaži</Button>}
      {canCreate && ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(value.status) && <Button type="button" disabled={disabled} onClick={event => onRebook(value, event.currentTarget)}>Rezerviši ponovo</Button>}
    </footer>
  </article>
}
