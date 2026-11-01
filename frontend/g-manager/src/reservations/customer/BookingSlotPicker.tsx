import type { AvailabilitySlot } from '../../types/availability.types'
import { Badge, Input } from '../../components/ui'
import { bookingConflictReason } from '../bookingConflictReason'
import { formatBusinessIntervalEnd, formatBusinessTime } from '../dateTime'

export function BookingSlotPicker({ slots, selectedStart, blocked, onChoose, anyEmployee }: {
  slots: AvailabilitySlot[]; selectedStart: string; blocked: boolean; onChoose: (slot: AvailabilitySlot) => void; anyEmployee: boolean
}) {
  const available = slots.filter(slot => !slot.status || slot.status === 'AVAILABLE')
  const occupied = slots.filter(slot => slot.status?.startsWith('OCCUPIED_'))
  const unavailable = slots.filter(slot => slot.status === 'UNAVAILABLE')
  function render(values: AvailabilitySlot[]) {
    return <div className="gm-my-booking-slots">{values.map(slot => <label key={`${slot.startTime}:${slot.employeeId}`} className={`gm-my-booking-slot${slot.status?.startsWith('OCCUPIED_') ? ' is-occupied' : ''}${selectedStart === slot.startTime ? ' is-selected' : ''}`}>
      <Input type="radio" name="booking-start" checked={selectedStart === slot.startTime} disabled={blocked} onChange={() => onChoose(slot)} />
      <strong>{formatBusinessTime(slot.startTime)}-{formatBusinessIntervalEnd(slot.startTime, slot.endTime, 'sr-Latn-RS')}</strong>
      <Badge tone={slot.status?.startsWith('OCCUPIED_') ? 'warning' : 'success'}>{slot.status?.startsWith('OCCUPIED_') ? 'Zauzet' : 'Slobodan'}</Badge>
      <small>{[slot.resourceCode, slot.resourceName, slot.locationName, anyEmployee ? slot.employeeName : null].filter(Boolean).join(' · ')}</small>
      {slot.reason && <small>{bookingConflictReason(slot.reason)}</small>}
    </label>)}</div>
  }
  return <><h3>Slobodni počeci</h3>{available.length ? render(available) : <p>Nema slobodnih početaka za ovaj izbor.</p>}
    {occupied.length > 0 && <details className="ui-advanced-filters"><summary>Želim zauzet termin - lista čekanja ({occupied.length})</summary>{render(occupied)}</details>}
    {unavailable.length > 0 && <details className="ui-advanced-filters"><summary>Zašto neki termini nisu dostupni ({unavailable.length})</summary>
      <ul>{unavailable.map(slot => <li key={slot.startTime}>{formatBusinessTime(slot.startTime)} · {bookingConflictReason(slot.reason)}</li>)}</ul></details>}
  </>
}
