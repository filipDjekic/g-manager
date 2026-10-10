import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { reservationApi } from '../api/reservationApi'
import { resourceApi } from '../api/resourceApi'
import { userApi } from '../api/userApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Badge, Button, EmptyState, ErrorState, Skeleton, TableShell } from '../components/ui'
import { reservationLabels, reservationTones } from '../components/ui/statusPresentation'
import { useListUrlState } from '../lists/useListUrlState'
import { CustomerPicker } from '../reservations/CustomerPicker'
import { ReservationDetailsDrawer } from '../reservations/ReservationDetailsDrawer'
import { ReservationIcon } from '../reservations/ReservationIcon'
import { ReservationScopeSwitch } from '../reservations/ReservationScopeSwitch'
import { StaffReservationForm } from '../reservations/StaffReservationForm'
import { businessLocalToInstant, todayInBusinessZone } from '../reservations/dateTime'
import type { ReservationScope, ReservationStatus } from '../types/reservation.types'
import { CalendarMonth } from '../calendar/CalendarMonth'
import { CalendarEvent, CalendarTimeline } from '../calendar/CalendarTimeline'
import { addDays, addMonths, calendarViews, dateLabel, eventTime, eventsByDay, instantLabel, monthDays, monthLabel, rangeFor, validDate, type CalendarView } from '../calendar/calendarModel'
import '../calendar/calendar.css'

const allowed = ['scope','customerId','locationId','areaId','view','date','employeeId','status','resourceId','reservationId'] as const
const statuses = Object.keys(reservationLabels) as ReservationStatus[]

export function CalendarPage() {
  const actor = useAuthStore(state => state.user), client = useQueryClient()
  const defaults = useMemo(() => ({scope: actor?.role === 'EMPLOYEE' ? 'MANAGEABLE' : 'ALL',customerId: '',locationId: '',areaId: '',
    view: 'day',date: todayInBusinessZone(),employeeId: '',status: '',resourceId: '',reservationId: ''}),[actor?.role])
  const url = useListUrlState(defaults,allowed)
  const scope: ReservationScope = url.state.scope === 'MANAGEABLE' ? 'MANAGEABLE' : 'ALL'
  const view: CalendarView = Object.hasOwn(calendarViews,url.state.view) ? url.state.view as CalendarView : 'day'
  const anchor = validDate(url.state.date) ? url.state.date : defaults.date
  const [miniMonth,setMiniMonth] = useState(anchor), [createOpen,setCreateOpen] = useState(false)
  const [moreFilters,setMoreFilters] = useState(!!url.state.customerId), [message,setMessage] = useState('')
  const [now,setNow] = useState(Date.now())
  const returnFocus = useRef<HTMLElement | null>(null)
  const canCreate = actor?.role !== 'CUSTOMER' && hasCapability(actor,'RESERVATION_CREATE')
  const canEmployees = hasCapability(actor,'EMPLOYEE_LIST'), canCustomers = hasCapability(actor,'CUSTOMER_READ')
  const range = useMemo(() => rangeFor(view,anchor),[view,anchor])
  useEffect(() => {setMiniMonth(anchor)},[anchor])
  useEffect(() => {const timer=window.setInterval(() => setNow(Date.now()),30000);return () => window.clearInterval(timer)},[])
  const employees = useQuery({queryKey: ['users','calendar-employees',actor?.id],queryFn: userApi.employees,enabled: canEmployees})
  const locations = useQuery({queryKey: ['resources','locations'],queryFn: resourceApi.locations,enabled: hasCapability(actor,'RESOURCE_READ')})
  const areas = useQuery({queryKey: ['resources','areas',url.state.locationId],queryFn: () => resourceApi.areas(url.state.locationId),
    enabled: !!url.state.locationId && hasCapability(actor,'RESOURCE_READ')})
  const inventory = useQuery({queryKey: ['resources','reservation-filters',actor?.id],queryFn: resourceApi.reservationResources,refetchInterval: 15000})
  const management = useQuery({queryKey: ['resource-management-scope'],queryFn: resourceApi.managementScope,enabled: actor?.role === 'EMPLOYEE',refetchInterval: 15000})
  const resourceOptions = inventory.data?.filter(item => (!url.state.locationId || item.locationId === url.state.locationId)
    && (!url.state.areaId || item.areaId === url.state.areaId)
    && (actor?.role !== 'EMPLOYEE' || scope !== 'MANAGEABLE' || management.data?.allResources || management.data?.resourceIds.includes(item.id))) ?? []
  const filters = {scope,employeeId: url.state.employeeId || undefined,customerId: url.state.customerId || undefined,
    locationId: url.state.locationId || undefined,areaId: url.state.areaId || undefined,resourceId: url.state.resourceId || undefined}
  const status = statuses.find(item => item === url.state.status)
  const result = useQuery({queryKey: ['reservations','calendar',actor?.id,{...filters,status,from: range.from,to: addDays(range.to,1)}],
    queryFn: () => reservationApi.calendar({...filters,status,from: range.from,to: addDays(range.to,1)}),refetchInterval: 15000})
  const contextParams = {date: anchor,scope,locationId: filters.locationId,areaId: filters.areaId,resourceId: filters.resourceId,employeeId: filters.employeeId}
  const context = useQuery({queryKey: ['reservations','calendar-context',actor?.id,contextParams],
    queryFn: () => reservationApi.calendarContext(contextParams),refetchInterval: 15000})
  const summary = useQuery({queryKey: ['reservations','summary',actor?.id,filters],queryFn: () => reservationApi.summary(filters),refetchInterval: 15000})
  const miniDays = useMemo(() => monthDays(miniMonth),[miniMonth])
  const mini = useQuery({queryKey: ['reservations','calendar',actor?.id,{...filters,status,from: miniDays[0],to: miniDays[41]}],
    queryFn: () => reservationApi.calendar({...filters,status,from: miniDays[0],to: miniDays[41]}),refetchInterval: 15000})
  const events = useMemo(() => {
    const start = view === 'day' && context.data ? Date.parse(context.data.rangeStart) : Date.parse(businessLocalToInstant(`${range.from}T00:00`))
    const end = view === 'day' && context.data ? Date.parse(context.data.rangeEnd) : Date.parse(businessLocalToInstant(`${addDays(range.to,1)}T00:00`))
    return result.error ? [] : (result.data??[]).filter(item => Date.parse(item.startTime) < end && Date.parse(item.endTime) > start)
  },[result.data,result.error,context.data,range.from,range.to,view])
  const byDay = useMemo(() => eventsByDay(events,range.days),[events,range.days])
  const miniByDay = useMemo(() => eventsByDay(mini.error ? [] : mini.data??[],miniDays),[mini.data,mini.error,miniDays])
  const areaNames = useMemo(() => Object.fromEntries([
    ...(inventory.data??[]).filter(item=>item.areaName).map(item=>[item.id,item.areaName!]),
    ...(context.data?.resources??[]).map(item=>[item.id,item.areaName]),
  ]),[context.data?.resources,inventory.data])
  const serverOffset = useMemo(() => context.data ? Date.parse(context.data.serverTime)-Date.now() : 0,[context.data])
  useEffect(() => {setNow(Date.now())},[context.data?.serverTime])
  const refresh = () => client.invalidateQueries({queryKey: ['reservations']})
  const openReservation = (id: string,event: MouseEvent<HTMLButtonElement>) => {returnFocus.current=event.currentTarget;url.set({reservationId:id})}
  const openCreate = (event: MouseEvent<HTMLButtonElement>) => {returnFocus.current=event.currentTarget;setCreateOpen(true)}
  const changeScope = (next: ReservationScope) => url.set({scope:next,
    ...(next==='MANAGEABLE' && url.state.resourceId && !management.data?.allResources && !management.data?.resourceIds.includes(url.state.resourceId) ? {resourceId:''} : {})})
  const move = (direction: number) => url.set({date: view === 'month' ? addMonths(anchor,direction) : addDays(anchor,direction*(view==='day'?1:7))})
  const selectDate = (date: string) => {if(validDate(date))url.set({date})}
  const kpis = [
    {label:'Rezervacije danas',value:summary.error?undefined:summary.data?.todayReservations,kind:'calendar' as const,accent:'blue',hint:'Današnji termini · Europe/Belgrade'},
    {label:'Predstojeće',value:summary.error?undefined:summary.data?.upcomingReservations,kind:'clock' as const,accent:'purple',hint:'Na čekanju i potvrđene · narednih 7 dana'},
    {label:'Zauzete stanice',value:context.error?undefined:context.data?.occupiedStations,kind:'users' as const,accent:'blue',hint:'Aktivne gaming sesije · izabrani resursi'},
    {label:'Otkazane za danas',value:summary.error?undefined:summary.data?.cancelledTodayAppointments,kind:'cancel' as const,accent:'pink',hint:'Otkazane rezervacije za današnje termine'},
  ]
  return <main className="workspace gm-calendar-page">
    <header className="gm-calendar-header"><div className="gm-calendar-title"><span><ReservationIcon/></span><div><h1>Kalendar</h1><p>Pregled rezervacija, dostupnosti resursa i zaposlenih.</p></div></div>
      {canCreate && <Button type="button" className="gm-calendar-create" onClick={openCreate}>+ Nova rezervacija</Button>}
    </header>
    {message && <p className="success-banner" role="status">{message}</p>}
    <section className="gm-calendar-kpis" aria-label="Statistika kalendara">
      {kpis.map(kpi => <article key={kpi.label} className={`gm-calendar-kpi gm-calendar-kpi--${kpi.accent}`}><div><span>{kpi.label}</span><ReservationIcon kind={kpi.kind}/></div>
        <strong aria-live="polite">{kpi.value ?? '—'}</strong><small>{kpi.hint}</small></article>)}
    </section>
    {summary.error && <ErrorState message="Statistiku rezervacija nije moguće učitati." action={<Button variant="secondary" onClick={() => summary.refetch()}>Pokušaj ponovo</Button>}/>}
    <div className="gm-calendar-layout"><section className="gm-calendar-main" aria-label="Raspored rezervacija">
      <div className="gm-calendar-filters">
        <label>Lokal<select value={url.state.locationId} disabled={locations.isLoading || !!locations.error} onChange={event => url.set({locationId:event.target.value,areaId:'',resourceId:''})}>
          <option value="">Svi lokali</option>{locations.data?.map(item=><option key={item.id} value={item.id}>{item.name}{!item.active?' · Neaktivan':''}</option>)}</select></label>
        <label>Zona<select value={url.state.areaId} disabled={!url.state.locationId || areas.isFetching || !!areas.error} onChange={event=>url.set({areaId:event.target.value,resourceId:''})}>
          <option value="">Sve zone</option>{areas.data?.map(item=><option key={item.id} value={item.id}>{item.name}{!item.active?' · Neaktivna':''}</option>)}</select></label>
        {canEmployees && <label>Zaposleni<select value={url.state.employeeId} disabled={employees.isLoading || !!employees.error} onChange={event=>url.set({employeeId:event.target.value})}>
          <option value="">Svi zaposleni</option>{employees.data?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <label>Gaming stanica / resurs<select value={url.state.resourceId} disabled={inventory.isLoading || !!inventory.error || actor?.role==='EMPLOYEE' && scope==='MANAGEABLE' && (management.isLoading || !!management.error)}
          onChange={event=>url.set({resourceId:event.target.value})}><option value="">Svi resursi</option>
          {url.state.resourceId && !resourceOptions.some(item=>item.id===url.state.resourceId) && <option value={url.state.resourceId} disabled>Izabrani resurs nije u ovom opsegu</option>}
          {resourceOptions.map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label>Status<select value={status??''} onChange={event=>url.set({status:event.target.value})}><option value="">Svi statusi</option>{statuses.map(item=><option key={item} value={item}>{reservationLabels[item]}</option>)}</select></label>
        <label>Datum<input type="date" value={anchor} onClick={event=>{try{event.currentTarget.showPicker?.()}catch{/* native fallback */}}} onChange={event=>selectDate(event.target.value)}/></label>
      </div>
      {(locations.error || areas.error || inventory.error || employees.error || management.error) && <ErrorState message="Neke opcije filtera nije moguće učitati." action={<Button variant="secondary" onClick={() => {
        void locations.refetch();void inventory.refetch();if(url.state.locationId)void areas.refetch();if(canEmployees)void employees.refetch();if(actor?.role==='EMPLOYEE')void management.refetch()
      }}>Pokušaj ponovo</Button>}/>}
      <div className="gm-calendar-filter-extras">{actor?.role==='EMPLOYEE' && <ReservationScopeSwitch scope={scope} onChange={changeScope}/>}
        {canCustomers && <Button type="button" variant="secondary" aria-expanded={moreFilters} onClick={()=>setMoreFilters(value=>!value)}><ReservationIcon kind="filter"/>Više filtera{url.state.customerId?' · Klijent':''}</Button>}
        {moreFilters && canCustomers && <CustomerPicker value={url.state.customerId} onChange={customerId=>url.set({customerId})}/>}
      </div>
      <div className="gm-calendar-period"><div className="gm-calendar-period-title"><h2>{view==='month'?monthLabel(anchor):view==='day'?dateLabel(anchor,true):`${dateLabel(range.from)} – ${dateLabel(range.to)}`}</h2>
        <span>{calendarViews[view]} · Europe/Belgrade{result.isFetching && !result.isLoading?' · Osvežavanje…':''}</span></div>
        <div className="gm-calendar-navigation"><Button type="button" variant="secondary" aria-label="Prethodni period" onClick={()=>move(-1)}>‹</Button>
          <Button type="button" variant="secondary" onClick={()=>selectDate(todayInBusinessZone())}>Danas</Button><Button type="button" variant="secondary" aria-label="Sledeći period" onClick={()=>move(1)}>›</Button></div>
      </div>
      <div className="gm-calendar-views gm-calendar-mobile-views" role="group" aria-label="Režim prikaza na manjim ekranima">
        {(Object.keys(calendarViews) as CalendarView[]).map(item=><Button type="button" key={item} variant="secondary" aria-pressed={item===view} onClick={()=>url.set({view:item})}>{calendarViews[item]}</Button>)}
      </div>
      {result.isLoading ? <Skeleton lines={7} label="Učitavanje kalendara"/> : result.error ? <ErrorState message="Kalendar nije moguće učitati." action={<Button onClick={()=>result.refetch()}>Pokušaj ponovo</Button>}/>
        : view==='day' ? context.isLoading ? <Skeleton lines={7} label="Učitavanje resursa i radnog vremena"/> : context.error ? <ErrorState message="Stvarnu zauzetost i stanje resursa nije moguće učitati." action={<Button onClick={()=>context.refetch()}>Pokušaj ponovo</Button>}/>
          : context.data && <CalendarTimeline context={context.data} events={events} now={now+serverOffset} onOpen={openReservation}/>
        : view==='week' ? <div className="gm-calendar-week" aria-label="Sedmodnevni pregled">{range.days.map(day=><article key={day} className={`gm-calendar-week-day${day===todayInBusinessZone()?' is-today':''}`}>
          <button type="button" className="gm-calendar-week-day-title" onClick={()=>url.set({date:day,view:'day'})}><time dateTime={day}>{dateLabel(day)}</time><small>{byDay[day]?.length??0} rezervacija</small></button>
          <div>{(byDay[day]??[]).map(item=><CalendarEvent key={item.id} item={item} onOpen={openReservation}/>)}{!byDay[day]?.length && <p>Nema rezervacija.</p>}</div>
        </article>)}</div>
        : view==='month' ? <><CalendarMonth month={anchor} selected={anchor} byDay={byDay} onSelect={selectDate}/><section className="gm-calendar-month-agenda"><h3>{dateLabel(anchor,true)}</h3>
          <div>{(byDay[anchor]??[]).map(item=><CalendarEvent key={item.id} item={item} onOpen={openReservation}/>)}</div>{!byDay[anchor]?.length && <p>Nema rezervacija za izabrani dan.</p>}</section></>
        : events.length ? <TableShell label="Lista rezervacija"><table className="gm-calendar-list"><thead><tr><th>Datum i vreme</th><th>Klijent / usluga</th><th>Resurs / lokal</th><th>Status</th><th>Detalji</th></tr></thead>
          <tbody>{events.map(item=><tr key={item.id}><td><time dateTime={item.startTime}>{instantLabel(item.startTime)}</time><small>Kraj: {instantLabel(item.endTime)}</small></td>
            <td><strong>{item.customerName}</strong><small>{item.serviceName}</small><small>{item.employeeName}</small></td><td>{item.resourceCode??item.resourceName??'Bez dodeljenog resursa'}<small>{item.locationName??'Lokal nije dodeljen'}</small></td>
            <td className={`gm-calendar-status-${item.status.toLowerCase()}`}><Badge tone={reservationTones[item.status]}>{reservationLabels[item.status]}</Badge>{item.readOnly&&<small>Samo pregled</small>}</td>
            <td><Button type="button" variant="secondary" onClick={event=>openReservation(item.id,event)} aria-label={`Detalji rezervacije: ${item.customerName}, ${eventTime(item)}`}>Detalji</Button></td>
          </tr>)}</tbody></table></TableShell> : <EmptyState title="Nema rezervacija u periodu" description="Promenite period ili filtere."/>}
    </section><aside className="gm-calendar-side" aria-label="Kontrole i pomoćni kalendar">
      <section className="gm-calendar-side-panel"><h2>Prikaz kalendara</h2><div className="gm-calendar-views" role="group" aria-label="Režim prikaza">
        {(Object.keys(calendarViews) as CalendarView[]).map(item=><Button type="button" key={item} variant="secondary" aria-pressed={item===view} onClick={()=>url.set({view:item})}>{calendarViews[item]}</Button>)}
      </div></section>
      <section className="gm-calendar-side-panel" aria-label="Mali mesečni kalendar"><CalendarMonth month={miniMonth} selected={anchor} byDay={miniByDay} mini onMonth={setMiniMonth} onSelect={selectDate}/>
        {mini.isLoading && <small role="status">Učitavanje indikatora rezervacija…</small>}{mini.error && <p className="search-help">Indikatore rezervacija nije moguće učitati. <button type="button" onClick={()=>mini.refetch()}>Pokušaj ponovo</button></p>}</section>
      <section className="gm-calendar-side-panel"><h2>Statusi rezervacija</h2><ul className="gm-calendar-legend">
        {statuses.map(item=><li key={item}><i className={`gm-calendar-status-${item.toLowerCase()}`} aria-hidden="true"/>{reservationLabels[item]}</li>)}
      </ul><ul className="gm-calendar-legend gm-calendar-legend--occupancy"><li><i className="gm-calendar-session" aria-hidden="true"/>Aktivna gaming sesija</li>
        <li><i className="gm-calendar-busy" aria-hidden="true"/>Zauzeće resursa</li><li><i className="gm-calendar-closed" aria-hidden="true"/>Nedostupno / van radnog vremena</li>
        {url.state.employeeId && <li><i className="gm-calendar-employee-block" aria-hidden="true"/>Zaposleni zauzet ili na odsustvu</li>}</ul></section>
      <section className="gm-calendar-side-panel"><h2>Brze akcije</h2><div className="gm-calendar-quick-actions">
        {canCreate&&<Button type="button" className="gm-calendar-create" onClick={openCreate}>+ Nova rezervacija</Button>}
        {hasCapability(actor,'RESERVATION_READ_ALL')&&<Link className="gm-calendar-link" to="/reservations">Prikaži sve rezervacije <span aria-hidden="true">↗</span></Link>}
        {hasCapability(actor,'RESOURCE_READ')&&<Link className="gm-calendar-link" to="/resources">Upravljanje resursima <span aria-hidden="true">↗</span></Link>}
      </div></section>
    </aside></div>
    {createOpen&&canCreate&&<StaffReservationForm onClose={()=>setCreateOpen(false)} onCreated={(id,summaryText)=>{setCreateOpen(false);setMessage(summaryText??'Rezervacija je kreirana.');url.set({reservationId:id});void refresh()}}/>}
    <ReservationDetailsDrawer reservationId={url.state.reservationId||null} onClose={()=>url.set({reservationId:''})} onChanged={refresh}
      appearance="calendar" areaNames={areaNames} returnFocusRef={returnFocus}/>
  </main>
}
