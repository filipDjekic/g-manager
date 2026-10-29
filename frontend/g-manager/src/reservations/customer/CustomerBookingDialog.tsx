
import { Button, EmptyState, ErrorState, Input, Modal, Select, Skeleton, Textarea, Alert } from '../../components/ui'

import { formatBusinessDateTime, formatBusinessIntervalEnd, todayInBusinessZone } from '../dateTime'
import { RecurrencePreviewPanel, RecurrenceResultPanel } from '../RecurrencePreviewPanel'
import { ReservationTimePicker } from '../ReservationTimePicker'

import { bookingConflictReason } from '../bookingConflictReason'

import type { RecurrenceConflictPolicy, RecurrenceFrequency } from '../../types/reservation.types'
import { CalendarClock } from './customerPresentation'
import { customerDuration, customerReservationError } from './customerPresentation.model'

import { BookingSlotPicker } from './BookingSlotPicker'
import { useCustomerBooking, type CustomerBookingProps } from './useCustomerBooking'
export type { BookingPrefill } from './useCustomerBooking'
export function CustomerBookingDialog(props: CustomerBookingProps) {
  const { services, employees, loading, dataError, returnFocusRef, onReload, onScopeChanged, onClose } = props
  const {
    id, serviceId, setServiceId, resourceId, setResourceId, setLocationId, setAreaId,
    employeeChoice, setEmployeeChoice, date, setDate, fromTime, setFromTime, toTime,
    setToTime, endDate, setEndDate, durationChoice, setDurationChoice, selectedStart, note,
    setNote, recurring, setRecurring, frequency, setFrequency, recurrenceInterval, setRecurrenceInterval,
    occurrences, setOccurrences, conflictPolicy, setConflictPolicy, recurrenceResult, error, submitting,
    joining, frozen, blocked, service, resourceOptions, rules, resources,
    selectedResource, locations, scopedLocationId, areas, scopedAreaId, resourceRequired, physicalStep,
    scopeReady, minimum, defaultDuration, manualStart, timeError, duration, availability,
    slots, chosenSlot, occupied, resolvedResourceId, assigned, slotResources, resourceUnavailable,
    preview, dismiss, canSubmit, needsStandardWaitlist, waitlistAvailability, canJoin, resetSelection,
    choose, create, joinWaitlist
  } = useCustomerBooking(props)
  const footer = recurrenceResult ? <div className="ui-actions dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Zatvori</Button></div>
    : <div className="ui-actions dialog-actions"><Button type="button" variant="secondary" disabled={blocked} onClick={dismiss.close}>Otkaži</Button>
      {occupied && !recurring && !frozen ? <Button type="button" disabled={!canJoin || blocked} loading={joining} onClick={() => void joinWaitlist()}>Prijavi se na listu čekanja</Button>
        : <Button type="submit" form={id} loading={submitting} disabled={joining || !canSubmit && !frozen}>{frozen ? 'Ponovi isti zahtev' : recurring ? 'Kreiraj seriju' : 'Pošalji rezervaciju'}</Button>}</div>
  return <>{dismiss.confirmationDialog}<Modal size="wide" open title="Nova rezervacija" titleIcon={<CalendarClock />} className="gm-my-booking-dialog" closeDisabled={blocked} returnFocusRef={returnFocusRef} onClose={dismiss.close} footer={footer}>
    {recurrenceResult ? <RecurrenceResultPanel result={recurrenceResult} locale="sr-Latn-RS" /> : <form id={id} className="ui-form-grid gm-my-booking" onSubmit={create}>
      <p className="gm-my-booking-intro">Izaberite uslugu i termin. Dostupnost se proverava ponovo pri potvrđivanju.</p>
      {error && <Alert tone="danger" role="alert">{error}</Alert>}
      {frozen && <p className="gm-my-reservation-warning" role="status">Prethodni zahtev čeka konačan ishod. Ponovite isti zahtev sa istim podacima da biste dobili njegov rezultat.</p>}
      {loading ? <Skeleton lines={4} label="Učitavanje usluga i zaposlenih" /> : dataError ? <ErrorState message={customerReservationError(dataError, 'Podaci za zakazivanje nisu dostupni.')} action={<Button variant="secondary" type="button" onClick={onReload}>Pokušaj ponovo</Button>} /> : null}
      <fieldset disabled={blocked || loading || Boolean(dataError)} className="gm-my-booking-fields">
        <section className="gm-my-booking-step"><h3><span>1</span>Usluga i prostor</h3><div className="gm-my-booking-grid">
          <label className="gm-my-full">Usluga<Select aria-label={"Usluga"} required value={serviceId} onChange={event => { const next = event.target.value; setServiceId(next); setResourceId(''); setLocationId(''); setAreaId(''); setEmployeeChoice('ANY'); setDurationChoice(undefined); setDate(''); setRecurring(false); resetSelection(true); onScopeChanged({ serviceId: next }) }}>
            <option value="">Izaberite uslugu</option>{serviceId && !service && <option value={serviceId} disabled>Izabrana usluga nije dostupna za rezervisanje</option>}
            {services.map(value => <option key={value.id} value={value.id}>{value.name} · {value.durationMinutes} min</option>)}</Select></label>
          {serviceId && resourceOptions.isLoading && <div className="gm-my-full"><Skeleton lines={2} label="Učitavanje resursa" /></div>}
          {resourceOptions.isError && <div className="gm-my-full"><ErrorState message={customerReservationError(resourceOptions.error, 'Resurse nije moguće učitati.')} action={<Button variant="secondary" type="button" onClick={() => resourceOptions.refetch()}>Pokušaj ponovo</Button>} /></div>}
          {serviceId && physicalStep && <><label>Lokal<Select aria-label={"Lokal"} required={resourceRequired} value={scopedLocationId} onChange={event => { const next = event.target.value; setLocationId(next); setAreaId(''); setResourceId(''); resetSelection(); onScopeChanged({ serviceId, locationId: next }) }}>
            <option value="">Izaberite lokal</option>{locations.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</Select></label>
            <label>Zona<Select aria-label={"Zona"} required={resourceRequired} value={scopedAreaId} disabled={!scopedLocationId || blocked} onChange={event => { const next = event.target.value; setAreaId(next); setResourceId(''); resetSelection(); onScopeChanged({ serviceId, locationId: scopedLocationId, areaId: next }) }}>
              <option value="">Izaberite zonu</option>{areas.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</Select></label>
            <details className="ui-advanced-filters gm-my-full" open={!!resourceId || undefined}><summary>Želim određeni računar / mesto</summary>
            <label className="gm-my-full">Računar / resurs<Select aria-label={"Računar / resurs"} value={resourceId} disabled={!scopeReady || blocked} onChange={event => { setResourceId(event.target.value); resetSelection(); onScopeChanged({ serviceId, locationId: scopedLocationId, areaId: scopedAreaId, resourceId: event.target.value }) }}>
              <option value="">Automatski izaberi slobodan kompatibilni resurs</option>{resourceId && !selectedResource && <option value={resourceId} disabled>Izabrani resurs više nije dostupan</option>}
              {resources.filter(value => value.locationId === scopedLocationId && value.areaId === scopedAreaId).map(value => <option key={value.id} value={value.id}>{value.code} · {value.name}</option>)}</Select></label>
            </details>
            {!resourceOptions.isLoading && !resourceOptions.isError && !resources.length && <p className="gm-my-reservation-warning gm-my-full">Za ovu uslugu trenutno nema kompatibilnih resursa.</p>}</>}
        </div></section>
        {serviceId && <section className="gm-my-booking-step"><h3><span>2</span>Datum i vreme</h3><div className="gm-my-booking-grid">
          <details className="ui-advanced-filters gm-my-full" open={employeeChoice !== 'ANY' || undefined}><summary>Izbor zaposlenog i ponavljajući termin</summary>
          <label>Zaposleni<Select aria-label={"Zaposleni"} required value={employeeChoice} onChange={event => { setEmployeeChoice(event.target.value); setDate(''); setRecurring(false); resetSelection(true) }}><option value="UNSELECTED">Izaberite opciju</option><option value="ANY">Bilo koji slobodan zaposleni</option>
            {employeeChoice !== 'ANY' && employeeChoice !== 'UNSELECTED' && !employees.some(value => value.id === employeeChoice) && <option value={employeeChoice} disabled>Izabrani zaposleni nije dostupan</option>}
            {employees.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</Select></label>
            <p>Za pojedinačni termin podrazumevano se bira bilo koji slobodan zaposleni. Za seriju izaberite konkretnog zaposlenog.</p></details>
          <label>Datum<Input aria-label={"Datum"} type="date" min={todayInBusinessZone()} required value={date} disabled={employeeChoice === 'UNSELECTED' || blocked} onChange={event => { setDate(event.target.value); resetSelection(true); setEndDate(event.target.value) }} /></label>
          {rules?.variableDuration && <><label>Trajanje (min)<Input type="number" required min={minimum} max={rules.maximumDurationMinutes} value={durationChoice ?? defaultDuration} disabled={blocked} onChange={event => { setDurationChoice(Number(event.target.value)); resetSelection(true) }} /></label><details className="ui-advanced-filters gm-my-full"><summary>Unesi tačan interval Od–Do</summary><div className="gm-my-booking-grid"><ReservationTimePicker label="Od" value={fromTime} disabled={blocked} onChange={value => { setFromTime(value); resetSelection() }} />
            <ReservationTimePicker label="Do" value={toTime} disabled={blocked} onChange={value => { setToTime(value); resetSelection() }} />
            <label>Datum završetka<Input aria-label={"Datum završetka"} type="date" min={date} required value={endDate || date} disabled={blocked} onChange={event => { setEndDate(event.target.value); resetSelection() }} /></label>
            <div className="gm-my-booking-duration"><span>Trajanje</span><strong>{!timeError ? customerDuration(duration) : '—'}</strong><small>{minimum}–{rules.maximumDurationMinutes} min</small></div>
            <p className="gm-my-booking-note gm-my-full">Izaberite ponuđeni početak ili unesite Od–Do. Proverava se ceo interval. Ručno uneto vreme mora biti dostupno u serverskom pregledu termina.</p>
            {timeError && <Alert tone="danger" className="gm-my-full" role="alert">{timeError}</Alert>}</div></details></>}
          {date && rules && !rules.variableDuration && <p className="gm-my-booking-note gm-my-full">Usluga ima fiksno trajanje od {rules.defaultDurationMinutes} minuta.</p>}
        </div></section>}
        {date && scopeReady && <section className="gm-my-booking-step"><h3>Izaberite početak</h3>
          <p className="gm-my-booking-note">Slobodan termin rezervišite uz potvrdu. Za zauzet termin možete se prijaviti na listu čekanja.</p>
          {availability.isLoading && <Skeleton lines={3} label="Provera dostupnosti termina" />}
          {availability.isError && <ErrorState message={customerReservationError(availability.error, 'Dostupne termine nije moguće učitati.')} action={<Button variant="secondary" type="button" onClick={() => availability.refetch()}>Pokušaj ponovo</Button>} />}
          {!availability.isLoading && !availability.isError && !slots.some(value => value.status !== 'UNAVAILABLE') && <EmptyState title="Nema ponuđenih termina" description="Proverite razloge nedostupnosti ili izaberite drugi datum, zaposlenog ili resurs." />}
          {manualStart && !timeError && !availability.isFetching && !availability.isError && !chosenSlot && <p className="gm-my-reservation-warning">Za ručno unet početak nema ponuđenog termina. Izaberite početak iz serverskog pregleda.</p>}
          {!availability.isError && <BookingSlotPicker slots={slots} selectedStart={selectedStart} blocked={blocked || availability.isFetching} onChoose={choose} anyEmployee={employeeChoice === 'ANY'} />}
        </section>}
        {chosenSlot && (!occupied || recurring) && chosenSlot.status !== 'UNAVAILABLE' && <label>Napomena (opciono)<Textarea aria-label={"Napomena (opciono)"} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>}
        {chosenSlot && chosenSlot.status !== 'UNAVAILABLE' && employeeChoice !== 'ANY' && <details className="gm-my-booking-recurrence" open={recurring} onToggle={event => { if (!blocked) setRecurring(event.currentTarget.open) }}><summary onClick={event => { if (blocked) event.preventDefault() }}>Ponavljajući termin</summary>
          {recurring && <>
          <div className="gm-my-booking-grid"><label>Učestalost<Select aria-label={"Učestalost"} value={frequency} onChange={event => setFrequency(event.target.value as RecurrenceFrequency)}><option value="WEEKLY">Nedeljno</option><option value="MONTHLY">Mesečno</option></Select></label>
            <label>Interval<Input aria-label={"Interval"} type="number" required min={1} max={4} value={recurrenceInterval} onChange={event => setRecurrenceInterval(Number(event.target.value))} /></label>
            <label>Broj termina<Input aria-label={"Broj termina"} type="number" required min={2} max={20} value={occurrences} onChange={event => setOccurrences(Number(event.target.value))} /></label>
            <label>Politika konflikata<Select aria-label={"Politika konflikata"} value={conflictPolicy} onChange={event => setConflictPolicy(event.target.value as RecurrenceConflictPolicy)}><option value="ALL_OR_NOTHING">Sve ili nijedan termin</option><option value="SKIP_CONFLICTS">Preskoči konflikte</option></Select></label></div>
          {physicalStep && <p className="gm-my-booking-note">Za svaki termin serije posebno se proverava resurs u izabranom prostoru.</p>}
          <Button type="button" variant="secondary" loading={preview.isFetching} onClick={() => preview.refetch()}>Pregledaj ponavljanje</Button>
          {preview.isLoading && <Skeleton lines={3} label="Provera ponavljajućih termina" />}{preview.isError && <ErrorState message={customerReservationError(preview.error, 'Ponavljanje nije moguće pregledati.')} action={<Button variant="secondary" type="button" onClick={() => preview.refetch()}>Pokušaj ponovo</Button>} />}
          {preview.data && <RecurrencePreviewPanel preview={preview.data} policy={conflictPolicy} locale="sr-Latn-RS" />}
          </>}
        </details>}
      </fieldset>
      {selectedStart && <section className="gm-my-booking-review"><h3>3 · Proverite i pošaljite zahtev</h3><p>Rezervacija čeka potvrdu osoblja. Termin i resurs se ponovo proveravaju pri slanju.</p><dl><div><dt>Usluga</dt><dd>{service?.name}</dd></div>
        <div><dt>Zaposleni</dt><dd>{employeeChoice === 'ANY' ? 'Bilo koji slobodan zaposleni' : employees.find(value => value.id === employeeChoice)?.name ?? chosenSlot?.employeeName}</dd></div>
        <div><dt>Lokal i zona</dt><dd>{chosenSlot?.locationName || selectedResource?.locationName || 'Lokal nije dodeljen'}{assigned?.areaName && ` · ${assigned.areaName}`}</dd></div>
        <div><dt>Računar / resurs</dt><dd>{resolvedResourceId ? [chosenSlot?.resourceCode || assigned?.code, chosenSlot?.resourceName || assigned?.name].filter(Boolean).join(' · ') : resourceRequired ? 'Resurs nije dodeljen' : 'Usluga ne zahteva resurs'}</dd></div>
        <div className="gm-my-full"><dt>Datum i vreme</dt><dd>{formatBusinessDateTime(selectedStart, false, 'sr-Latn-RS')}{chosenSlot && ` – ${formatBusinessIntervalEnd(selectedStart, chosenSlot.endTime, 'sr-Latn-RS')}`}</dd></div></dl>
        {!occupied && physicalStep && slotResources.isFetching && <p role="status">Provera dostupnosti resursa…</p>}
        {!occupied && slotResources.isError && <ErrorState message={customerReservationError(slotResources.error, 'Dostupnost resursa nije moguće proveriti.')} action={<Button variant="secondary" type="button" onClick={() => slotResources.refetch()}>Pokušaj ponovo</Button>} />}
        {resourceUnavailable && !occupied && <p className="gm-my-reservation-warning">Resurs više nije dostupan za izabrani interval. Osvežite pregled termina.</p>}
        {occupied && !recurring && <><p className="gm-my-reservation-warning">{bookingConflictReason(chosenSlot?.reason)}</p>
          {needsStandardWaitlist && <p className="gm-my-booking-note">Lista čekanja koristi standardno trajanje ove usluge: {service?.durationMinutes} min. Proverava se dostupnost tog intervala pre prijave.</p>}
          {waitlistAvailability.isFetching && needsStandardWaitlist && <p role="status">Provera termina za listu čekanja…</p>}
          {waitlistAvailability.isError && needsStandardWaitlist && <ErrorState message={customerReservationError(waitlistAvailability.error, 'Termin za listu čekanja nije moguće proveriti.')} action={<Button variant="secondary" type="button" onClick={() => waitlistAvailability.refetch()}>Pokušaj ponovo</Button>} />}
          {needsStandardWaitlist && !waitlistAvailability.isFetching && !waitlistAvailability.isError && !canJoin && <p className="gm-my-reservation-warning">Standardni interval nije ponuđen kao zauzet termin za listu čekanja. Izaberite drugi ponuđeni termin.</p>}</>}
        {!chosenSlot && <p className="gm-my-reservation-warning">Termin se promenio. Izaberite ga ponovo iz osveženog pregleda.</p>}
      </section>}
    </form>}
  </Modal></>
}
