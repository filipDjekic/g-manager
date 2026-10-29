
import { Button, EmptyState, ErrorState, Modal, Skeleton, Select, Input, Textarea, Card, Alert } from '../components/ui'
import { CustomerPicker } from './CustomerPicker'
import { RecurrencePreviewPanel, RecurrenceResultPanel } from './RecurrencePreviewPanel'
import { ReservationIcon } from './ReservationIcon'
import { ReservationTimePicker } from './ReservationTimePicker'
import { validTime } from './ReservationTimePicker.model'
import { bookingConflictReason, reservationApiErrorMessage as apiErrorMessage } from './bookingConflictReason'
import { formatBusinessIntervalEnd } from './dateTime'

import type { RecurrenceFrequency, RecurrenceConflictPolicy } from '../types/reservation.types'
import './reservations.css'

import { useStaffBooking, type StaffBookingProps, formatBusinessDateTime, intervalLabels, localRange, addDays, durationLabel } from './useStaffBooking'
export function StaffReservationForm(props: StaffBookingProps) {
  const { onClose, onCreated } = props
  const {
    formId, customerId, setCustomerId, customerName, setCustomerName, serviceId, setServiceId,
    employeeId, setEmployeeId, locationId, setLocationId, areaId, setAreaId, resourceId,
    setResourceId, range, setRange, note, setNote, review, setReview,
    repeat, setRepeat, frequency, setFrequency, interval, setInterval, occurrences,
    setOccurrences, conflictPolicy, setConflictPolicy, seriesResult, submitting, initializedService, services,
    service, customer, employees, locations, areas, scope, settings,
    rules, needsResource, start, end, inputError, duration, options,
    compatible, resource, validScope, validResource, plan, applyAlternative, preview,
    frozen, create, blocked, dismiss, minimum, nearestEnd, today,
    areaName, canSubmit
  } = useStaffBooking(props)
  return <>{dismiss.confirmationDialog}<Modal size="wide" open closeDisabled={blocked} title="Nova rezervacija" titleIcon={<ReservationIcon />} className="reservation-create-dialog"
    onClose={dismiss.close} footer={<div className="ui-actions dialog-actions reservation-create-actions">
      {seriesResult ? <><Button variant="secondary" type="button" onClick={onClose}>Zatvori</Button>
        <Button type="button" onClick={() => onCreated(seriesResult.created[0].id,`Kreirano ${seriesResult.created.length}, preskočeno ${seriesResult.skipped.length} termina.`)}>Otvori kreiranu rezervaciju</Button></>
        : <><Button type="button" variant="secondary" disabled={blocked} onClick={dismiss.close}>Otkaži</Button>
          {review && !blocked && <Button type="button" variant="secondary" onClick={() => setReview(false)}>Izmeni podatke</Button>}
          <Button type="submit" form={formId} loading={create.isPending} disabled={!canSubmit && !frozen}>{frozen ? 'Ponovi isti zahtev' : !repeat || review ? 'Kreiraj rezervaciju' : 'Pregled serije'}</Button></>}
    </div>}>
    {seriesResult ? <RecurrenceResultPanel result={seriesResult} locale="sr-Latn-RS" /> : <>
      <p className="reservation-create-intro">{review ? 'Proverite podatke i dostupnost pre konačnog kreiranja.' : 'Izaberite klijenta, uslugu, lokal i termin.'}</p>
      {frozen&&<Alert tone="warning">Ishod prethodnog zahteva nije potvrđen. Polja ostaju zaključana; proverite isti zahtev pre nove rezervacije.</Alert>}
      {create.error && <ErrorState message={apiErrorMessage(create.error,'Rezervaciju nije moguće kreirati.')} />}
      {scope.error && <ErrorState message="Dodele stanica nisu dostupne." action={<Button variant="secondary" type="button" onClick={() => scope.refetch()}>Pokušaj ponovo</Button>} />}
      {!scope.isLoading && !scope.error && !scope.data?.allResources && !scope.data?.resourceIds.length && <EmptyState title="Nemate dodeljene stanice" description="Administrator treba da vam dodeli stanicu pre kreiranja rezervacije." />}
      <form id={formId} className="ui-form-grid form-grid reservation-editor reservation-create-form" onSubmit={event => {
        event.preventDefault(); if (submitting.current || create.isPending) return
        if (canSubmit || frozen) {if (!repeat || review) {submitting.current = true; create.mutate()} else setReview(true)}
      }}>
        {!review ? <>
          <CustomerPicker value={customerId} required inline disabled={blocked} onChange={(id,name) => {setCustomerId(id);setCustomerName(name ?? '')}} />
          <label>Usluga<Select aria-label={"Usluga"} required disabled={blocked || services.isLoading || !!services.error} value={serviceId} onChange={event => {
            initializedService.current = ''; setServiceId(event.target.value);setResourceId('')
          }}><option value="">Izaberite uslugu</option>{services.data?.map(item => <option key={item.id} value={item.id}>{item.name}{item.durationMinutes ? ` · ${item.durationMinutes} min` : ''}</option>)}</Select></label>
          {services.error && <ErrorState message="Usluge nisu dostupne." action={<Button variant="secondary" type="button" onClick={() => services.refetch()}>Pokušaj ponovo</Button>} />}
          <label>Zaposleni<Select aria-label={"Zaposleni"} disabled={blocked || employees.isLoading || !!employees.error} value={employeeId} onChange={event => setEmployeeId(event.target.value)}>
            <option value="">Automatski slobodan zaposleni</option>{employees.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
          {employees.error && <ErrorState message="Zaposleni nisu dostupni." action={<Button variant="secondary" type="button" onClick={() => employees.refetch()}>Pokušaj ponovo</Button>} />}
          <label>Lokal<Select aria-label={"Lokal"} required={needsResource} disabled={blocked || locations.isLoading || !!locations.error} value={locationId}
            onChange={event => {setLocationId(event.target.value);setAreaId('');setResourceId('')}}><option value="">{needsResource ? 'Izaberite lokal' : 'Bez određenog lokala'}</option>
            {locations.data?.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
          <label>Zona<Select aria-label={"Zona"} required={needsResource} disabled={blocked || !locationId || areas.isFetching || !!areas.error} value={areaId}
            onChange={event => {setAreaId(event.target.value);setResourceId('')}}><option value="">{needsResource ? 'Izaberite zonu' : 'Bez određene zone'}</option>
            {areas.data?.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
          {(locations.error || areas.error) && <ErrorState message="Lokal ili zone nije moguće učitati." action={<Button variant="secondary" type="button" onClick={() => {void locations.refetch(); if(locationId) void areas.refetch()}}>Pokušaj ponovo</Button>} />}
          <label className="reservation-form-wide">Gaming računar / PlayStation / drugi resurs<Select aria-label={"Gaming računar / PlayStation / drugi resurs"} disabled={blocked || !service || options.isFetching || !validScope || !!options.error}
            value={resourceId} onChange={event => setResourceId(event.target.value)}><option value="">{needsResource ? 'Automatski dodeli slobodan resurs u izabranoj zoni' : 'Bez fizičkog resursa'}</option>
            {compatible.map(item => <option key={item.id} value={item.id} disabled={item.unavailabilityReason === 'Resource or location is inactive or not bookable'
              || item.unavailabilityReason === 'Station is unavailable for booking'}>{item.code} · {item.name} · {item.available ? 'Dostupno' : bookingConflictReason(item.unavailabilityReason)}</option>)}</Select></label>
          {(options.error || settings.error) && <ErrorState message={apiErrorMessage(options.error || settings.error,'Resurse i pravila trajanja nije moguće učitati.')} action={<Button variant="secondary" type="button" onClick={() => {void options.refetch();void settings.refetch()}}>Pokušaj ponovo</Button>} />}
          {rules && needsResource && validScope && !options.isFetching && !compatible.length && <Alert tone="warning">U izabranoj zoni nema kompatibilnih resursa kojima možete upravljati.</Alert>}
          {resource && !resource.available && <Alert tone="warning">{bookingConflictReason(resource.unavailabilityReason)}</Alert>}
          <section className="reservation-interval-fields" aria-label="Datum i vremenski interval">
            <label>Datum rezervacije<Input aria-label={"Datum rezervacije"} type="date" required min={today} disabled={blocked} value={range.date}
              onClick={event => {try {event.currentTarget.showPicker?.()} catch { /* native keyboard fallback */ }}}
              onChange={event => {const date = event.target.value;setRange(current => ({...current,date,endDate: current.endDate === current.date ? date : addDays(date,1)}))}} /></label>
            <label>Datum završetka<Input aria-label={"Datum završetka"} type="date" required min={range.date || today} disabled={blocked || !rules?.variableDuration} value={range.endDate}
              onChange={event => {setRange(current => ({...current,endDate: event.target.value}))}} /></label>
            <ReservationTimePicker label="Od" value={range.from} disabled={blocked || !service} onChange={from => {setRange(current => ({...current,from}))}} />
            <ReservationTimePicker label="Do" value={range.to} disabled={blocked || !rules?.variableDuration} onChange={to => {setRange(current => ({...current,to}))}} />
            {rules && <p className="search-help reservation-form-wide">{rules.variableDuration ? `Gaming termin: ${rules.minimumDurationMinutes}–${rules.maximumDurationMinutes} min. Sat nudi korake od 15 minuta; moguć je i ručni unos.` : `Ova usluga ima fiksno trajanje od ${rules.defaultDurationMinutes} minuta.`} Poslovna zona: Europe/Belgrade.</p>}
          </section>
          {inputError && service && <Alert tone="warning" className="reservation-form-wide" role="alert"><p>{inputError}</p>
            {nearestEnd && (duration < minimum || !validTime(range.to)) && <Button type="button" variant="secondary" disabled={blocked}
              onClick={() => {setRange(localRange(start,nearestEnd))}}>Postavi kraj na {formatBusinessDateTime(nearestEnd)}</Button>}</Alert>}
          {!inputError && <div className="reservation-duration-note" aria-live="polite"><span>Od {range.from} do {range.to}<strong>Ukupno: {durationLabel(duration)}</strong></span>
            <span>Datum završetka<strong>{formatBusinessDateTime(end)}</strong></span></div>}
          <section className="reservation-booking-availability" aria-label="Dostupnost celog intervala">
            {!validScope ? <p>Izaberite lokal i zonu za proveru dostupnosti.</p> : !validResource ? <Alert tone="warning">Izabrani resurs nije u izabranom lokalu i zoni.</Alert>
              : plan.isFetching ? <p role="status">Provera dostupnosti celog intervala…</p>
                : plan.error ? <ErrorState message={apiErrorMessage(plan.error,'Dostupnost nije moguće proveriti.')} action={<Button variant="secondary" type="button" onClick={() => plan.refetch()}>Pokušaj ponovo</Button>} />
                  : !inputError && plan.data && <p role="status" className={plan.data.available ? 'reservation-interval-available' : 'warning-banner'}>{plan.data.available ? 'Izabrani period je dostupan. Pre čuvanja će biti ponovo proveren.' : bookingConflictReason(plan.data.reason)}</p>}
            {!inputError && !plan.error && !plan.isFetching && plan.data && !plan.data.available && plan.data.alternatives.length > 0 && <div className="reservation-alternatives"><span>Dostupne alternative za isto trajanje:</span>
              {plan.data.alternatives.map(item => <Button key={item.startTime} type="button" variant="secondary" disabled={blocked} onClick={() => applyAlternative(item)}>{formatBusinessDateTime(item.startTime)} – {formatBusinessIntervalEnd(item.startTime,item.endTime,'sr-Latn-RS')}</Button>)}</div>}
          </section>
          {resourceId && range.date && plan.data && !plan.error && <section className="reservation-day-schedule" aria-label="Zauzetost resursa za izabrani dan">
            <h3>Zauzetost resursa za izabrani dan</h3><p>Stvarni intervali rezervacija i aktivnih sesija. Poslednja provera: {formatBusinessDateTime(plan.data.serverTime)}.</p>
            <ol>{plan.data.intervals.map(item => <li key={item.startTime} className={`reservation-day-interval reservation-day-interval--${item.status.toLowerCase()}`}>
              <span>{intervalLabels[item.status]}</span><time dateTime={item.startTime}>{formatBusinessDateTime(item.startTime)} – {formatBusinessDateTime(item.endTime)}</time></li>)}</ol>
          </section>}
          <details className="ui-advanced-filters reservation-form-wide"><summary>Ponavljanje i napredne opcije</summary><fieldset className="reservation-repeat-fields"><legend>Ponavljanje termina</legend>
            <label className="checkbox-field"><Input aria-label={"Ponavljajuća rezervacija"} type="checkbox" disabled={blocked} checked={repeat} onChange={event => setRepeat(event.target.checked)} /> Ponavljajuća rezervacija</label>
            {repeat && <><p className="search-help">Izaberite zaposlenog. Automatska dodela ostaje ograničena na izabranu zonu za sve termine.</p>
              <label>Učestalost<Select aria-label={"Učestalost"} disabled={blocked} value={frequency} onChange={event => setFrequency(event.target.value as RecurrenceFrequency)}><option value="WEEKLY">Nedeljno</option><option value="MONTHLY">Mesečno</option></Select></label>
              <label>Interval<Input aria-label={"Interval"} type="number" min={1} max={4} required disabled={blocked} value={interval} onChange={event => setInterval(Number(event.target.value))} /></label>
              <label>Broj termina<Input aria-label={"Broj termina"} type="number" min={2} max={20} required disabled={blocked} value={occurrences} onChange={event => setOccurrences(Number(event.target.value))} /></label>
              <label>Konflikti<Select aria-label={"Konflikti"} disabled={blocked} value={conflictPolicy} onChange={event => setConflictPolicy(event.target.value as RecurrenceConflictPolicy)}><option value="ALL_OR_NOTHING">Kreiraj samo ako su svi termini slobodni</option><option value="SKIP_CONFLICTS">Preskoči zauzete termine</option></Select></label></>}
          </fieldset></details>
          <label className="reservation-form-wide">Napomena<Textarea aria-label={"Napomena"} rows={3} maxLength={500} disabled={blocked} value={note} onChange={event => setNote(event.target.value)} /></label>
        </> : <Card className="panel reservation-review"><h3>Pregled pre kreiranja</h3>
          <p><strong>Klijent:</strong>{customer.data?.customer.name ?? customerName}</p><p><strong>Usluga:</strong>{service?.name}</p>
          <p><strong>Zaposleni:</strong>{employees.data?.find(item => item.id === employeeId)?.name ?? 'Automatski slobodan zaposleni'}</p>
          <p><strong>Lokal:</strong>{locations.data?.find(item => item.id === locationId)?.name ?? 'Bez određenog lokala'}</p><p><strong>Zona:</strong>{areaName ?? 'Bez određene zone'}</p>
          <p><strong>Računar / resurs:</strong>{resource ? `${resource.code} · ${resource.name}` : needsResource ? 'Automatska dodela slobodnog resursa u izabranoj zoni' : 'Bez fizičkog resursa'}</p>
          <p><strong>Početak:</strong>{start && formatBusinessDateTime(start)}</p><p><strong>Kraj:</strong>{end && formatBusinessDateTime(end)}</p>
          <p><strong>Ukupno trajanje:</strong>{durationLabel(duration)}</p>{note && <p><strong>Napomena:</strong>{note}</p>}
          {frozen && <p role="status">Prethodni zahtev čeka konačan ishod. Ponovite isti zahtev; podaci i Idempotency-Key su sačuvani.</p>}
          {!frozen && !canSubmit && <Alert tone="warning" role="alert">Dostupnost ili pravo rezervisanja se promenilo. Sačekajte proveru ili izmenite podatke.</Alert>}
        </Card>}
        {!repeat && start && end && service && customerName && <div className="ui-alert ui-alert--info"><strong>{customerName} · {service.name}</strong><p>{formatBusinessDateTime(start)} — {formatBusinessIntervalEnd(start,end,'sr-Latn-RS')} · {durationLabel(duration)}</p><small>Rezervacija čeka potvrdu osoblja.</small></div>}
        {repeat && <section aria-label="Dostupnost ponavljajućih termina">{preview.isFetching ? <Skeleton lines={3} /> : preview.error ? <ErrorState message={apiErrorMessage(preview.error,'Pregled serije nije dostupan.')}
          action={<Button variant="secondary" type="button" onClick={() => preview.refetch()}>Pokušaj ponovo</Button>} /> : preview.data ? <RecurrencePreviewPanel preview={preview.data} policy={conflictPolicy} locale="sr-Latn-RS" /> : <p>Unesite klijenta, uslugu, zaposlenog, zonu i vremenski interval za pregled serije.</p>}</section>}
      </form>
    </>}
  </Modal></>
}
