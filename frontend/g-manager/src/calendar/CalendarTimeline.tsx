import { useMemo, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react'
import { reservationLabels } from '../components/ui/statusPresentation'
import { bookingConflictReason } from '../reservations/bookingConflictReason'
import { dateInBusinessZone, formatBusinessTime } from '../reservations/dateTime'
import type { CalendarContext, CalendarReservation, CalendarResource } from '../types/reservation.types'
import { eventTime, instantLabel } from './calendarModel'

const resourceTypes = {GAMING_PC: 'Gaming računar', PLAYSTATION: 'PlayStation', SIMULATOR: 'Simulator', VIP_ROOM: 'VIP prostorija', OTHER: 'Drugi resurs'}
type OpenReservation = (id: string, event: MouseEvent<HTMLButtonElement>) => void
type Event = {key: string; start: number; end: number; lane: number; reservation?: CalendarReservation}
type Range = {start: number; end: number}
const restrictionLabel = (reason: string) => reason === 'STATION_CLIENT_OFFLINE' ? 'Gaming Client nije povezan.'
  : reason === 'STATION_LOCK_PENDING' ? 'Zaključavanje stanice čeka bezbednu potvrdu.' : bookingConflictReason(reason)
const mobileQuery = '(max-width: 767px)'
function subscribeMobile(onChange: () => void) {
  const media = window.matchMedia?.(mobileQuery)
  media?.addEventListener('change',onChange)
  return () => media?.removeEventListener('change',onChange)
}
const isMobile = () => window.matchMedia?.(mobileQuery).matches ?? false

export function CalendarEvent({item, onOpen}: {item: CalendarReservation; onOpen: OpenReservation}) {
  return <button type="button" className={`gm-calendar-agenda-event gm-calendar-status-${item.status.toLowerCase()}`}
    title={`${eventTime(item)} · ${item.serviceName} · ${item.customerName} · ${item.resourceName ?? 'Bez dodeljenog resursa'} · ${reservationLabels[item.status]}`}
    onClick={event => onOpen(item.id,event)}><time>{eventTime(item,true)}</time><strong>{item.customerName}</strong>
    <span>{item.serviceName}</span><small>{item.resourceCode ?? item.resourceName ?? 'Bez dodeljenog resursa'} · {item.employeeName}</small>
    <span className="gm-calendar-event-status">{reservationLabels[item.status]}{item.readOnly ? ' · Samo pregled' : ''}</span>
  </button>
}

function lanes(events: Omit<Event,'lane'>[]) {
  const ends: number[] = []
  return events.sort((a,b) => a.start-b.start || a.end-b.end || a.key.localeCompare(b.key)).map(event => {
    let lane = ends.findIndex(end => end <= event.start)
    if (lane < 0) lane = ends.length
    ends[lane] = event.end
    return {...event,lane}
  })
}
function closedRanges(from: number, to: number, windows: Range[]) {
  const result: Range[] = []; let cursor = from
  for (const window of [...windows].sort((a,b) => a.start-b.start)) {
    if (window.end <= from || window.start >= to) continue
    if (window.start > cursor) result.push({start: cursor,end: Math.min(window.start,to)})
    cursor = Math.max(cursor,window.end)
  }
  if (cursor < to) result.push({start: cursor,end: to})
  return result
}

export function CalendarTimeline({context, events, now, onOpen}: {
  context: CalendarContext; events: CalendarReservation[]; now: number; onOpen: OpenReservation
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const mobile = useSyncExternalStore(subscribeMobile,isMobile,()=>false)
  const model = useMemo(() => {
    const dayStart = Date.parse(context.rangeStart), dayEnd = Date.parse(context.rangeEnd)
    const visible = events.filter(item => Date.parse(item.startTime) < dayEnd && Date.parse(item.endTime) > dayStart)
    const windows = context.locations.flatMap(location => location.windows.map(window => ({start: Date.parse(window.startTime),end: Date.parse(window.endTime)})))
    const bounds = [...windows, ...visible.map(item => ({start: Math.max(dayStart,Date.parse(item.startTime)),end: Math.min(dayEnd,Date.parse(item.endTime))})),
      ...context.occupancy.map(item => ({start: Math.max(dayStart,Date.parse(item.startTime)),end: Math.min(dayEnd,Date.parse(item.endTime))}))]
    const earliest = bounds.reduce((value,range)=>Math.min(value,range.start),dayEnd)
    const latest = bounds.reduce((value,range)=>Math.max(value,range.end),dayStart)
    const from = bounds.length ? Math.max(dayStart,Math.floor(earliest/3600000)*3600000) : dayStart
    const to = bounds.length ? Math.min(dayEnd,Math.ceil(latest/3600000)*3600000) : dayEnd
    const byResource = new Map<string,Event[]>(), occupancy = new Map<string,CalendarContext['occupancy']>()
    const unassigned: CalendarReservation[] = []
    for (const item of visible) {
      if (!item.resourceId) {unassigned.push(item);continue}
      const list = byResource.get(item.resourceId) ?? []
      list.push({key: item.id,start: Date.parse(item.startTime),end: Date.parse(item.endTime),lane: 0,reservation: item});byResource.set(item.resourceId,list)
    }
    for (const item of context.occupancy) {
      const list = occupancy.get(item.resourceId) ?? [];list.push(item);occupancy.set(item.resourceId,list)
      if (item.kind === 'SESSION') {
        const row = byResource.get(item.resourceId) ?? []
        row.push({key: `session:${item.startTime}`,start: Date.parse(item.startTime),end: Date.parse(item.endTime),lane: 0});byResource.set(item.resourceId,row)
      }
    }
    byResource.forEach((items,id) => byResource.set(id,lanes(items)))
    const hours = new Map(context.locations.map(location => [location.id,location.windows.map(window => ({start: Date.parse(window.startTime),end: Date.parse(window.endTime)}))]))
    const resources = new Map<string,CalendarResource[]>()
    context.resources.forEach(item => {const list=resources.get(item.areaId)??[];list.push(item);resources.set(item.areaId,list)})
    const ticks: number[] = [];for (let instant=from;instant<=to;instant+=3600000) ticks.push(instant)
    return {from,to: Math.max(to,from+3600000),byResource,occupancy,unassigned,hours,resources,ticks}
  },[context,events])
  const span = model.to-model.from, percent = (instant: number) => (instant-model.from)/span*100
  const position = (start: number,end: number): CSSProperties => ({left: `${percent(Math.min(model.to,Math.max(start,model.from)))}%`,width: `${Math.max(0,Math.min(end,model.to)-Math.max(start,model.from))/span*100}%`})
  const toggle = (id: string) => setCollapsed(current => {const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})
  const showNow = now >= model.from && now < model.to
  return <>
    <p className="gm-calendar-timeline-help">Zauzeća ostaju vidljiva i kada filter sakrije rezervacije. Status uz naziv resursa označava njegovo trenutno stanje.</p>
    {!mobile && <div className="gm-calendar-timeline-scroll" role="region" aria-label="Vremenski raspored po resursima, horizontalno i vertikalno skrolovanje" tabIndex={0}>
      <div className="gm-calendar-matrix" style={{minWidth: `calc(${Math.max(640,span/3600000*64)}px + var(--calendar-resource-width))`, '--calendar-quarter': `${900000/span*100}%`} as CSSProperties}>
        <div className="gm-calendar-ruler"><div className="gm-calendar-resource-heading">Gaming resursi</div><div className="gm-calendar-hours">
          {model.ticks.map(tick => {const label=formatBusinessTime(new Date(tick).toISOString()), duplicate=model.ticks.filter(value => formatBusinessTime(new Date(value).toISOString())===label).length>1
            const nextDay=dateInBusinessZone(new Date(tick).toISOString())!==dateInBusinessZone(context.rangeStart)
            return <time key={tick} dateTime={new Date(tick).toISOString()} title={new Intl.DateTimeFormat('sr-Latn-RS',{timeZone:'Europe/Belgrade',dateStyle:'medium',timeStyle:'long'}).format(tick)} style={{left:`${percent(tick)}%`}}>
              {label}{nextDay && <small>+1 dan</small>}{duplicate && <small>{new Intl.DateTimeFormat('sr-Latn-RS',{timeZone:'Europe/Belgrade',timeZoneName:'shortOffset',hour:'2-digit'}).formatToParts(tick).find(part=>part.type==='timeZoneName')?.value}</small>}
            </time>})}
          {showNow && <span className="gm-calendar-now-label" aria-hidden="true" style={{left:`${percent(now)}%`}}>{formatBusinessTime(new Date(now).toISOString())}</span>}
        </div></div>
        {context.areas.map(area => {
          const resources=model.resources.get(area.id)??[]
          return <section className="gm-calendar-zone" key={area.id} aria-label={`${area.locationName}, ${area.name}`}>
            <button type="button" className="gm-calendar-zone-toggle" aria-expanded={!collapsed.has(area.id)} onClick={() => toggle(area.id)}>
              <span aria-hidden="true">{collapsed.has(area.id)?'›':'⌄'}</span><strong>{area.locationName} / {area.name}</strong><small>{resources.length} resursa{!area.active?' · Zona neaktivna':''}</small>
            </button>
            {!collapsed.has(area.id) && (!resources.length ? <p className="gm-calendar-empty-zone">Nema resursa u ovoj zoni za izabrani opseg i filtere.</p> : resources.map(resource => {
              const row=model.byResource.get(resource.id)??[], count=row.reduce((value,item)=>Math.max(value,item.lane+1),1)
              const closed=closedRanges(model.from,model.to,model.hours.get(resource.locationId)??[])
              return <div className="gm-calendar-resource-row" key={resource.id} style={{minHeight:`${count*58+18}px`}}>
                <div className="gm-calendar-resource-name"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                  <div><strong>{resource.code}</strong><span title={resource.name}>{resource.name}</span><small>{resourceTypes[resource.type]}</small>
                    {resource.currentRestriction && <small className="gm-calendar-resource-restricted" title={restrictionLabel(resource.currentRestriction)}>Trenutno nedostupan</small>}
                    {!resource.canManage && <small>Samo pregled</small>}</div>
                </div>
                <div className="gm-calendar-track">
                  {closed.map(range => <div key={`closed:${range.start}`} className="gm-calendar-closed" style={position(range.start,range.end)} title="Nedostupno — van radnog vremena"><span>Nedostupno</span></div>)}
                  {(model.occupancy.get(resource.id)??[]).filter(item=>item.kind==='RESERVATION').map((item,index) => <div key={`${item.startTime}:${index}`} className="gm-calendar-busy" style={position(Date.parse(item.startTime),Date.parse(item.endTime))} title={`Rezervisano: ${eventTime(item)}`} />)}
                  {context.employeeBlocks.filter(item=>Date.parse(item.startTime)<model.to && Date.parse(item.endTime)>model.from).map((item,index) => <div key={`employee:${index}`} className="gm-calendar-employee-block" style={position(Date.parse(item.startTime),Date.parse(item.endTime))}
                    title={`${item.kind==='TIME_OFF'?'Odobreno odsustvo zaposlenog':'Zaposleni ima rezervaciju'}: ${eventTime(item)}`} />)}
                  {row.map(item => item.reservation ? <button type="button" key={item.key} className={`gm-calendar-time-event gm-calendar-status-${item.reservation.status.toLowerCase()}`}
                    style={{...position(item.start,item.end),top:`${item.lane*58+9}px`}} onClick={event => onOpen(item.reservation!.id,event)}
                    title={`${eventTime(item.reservation)} · ${item.reservation.customerName} · ${item.reservation.serviceName} · ${reservationLabels[item.reservation.status]}${item.reservation.readOnly?' · Samo pregled':''}`}
                    aria-label={`${eventTime(item.reservation)} · ${resource.code} · ${item.reservation.customerName} · ${item.reservation.serviceName} · ${reservationLabels[item.reservation.status]}${item.reservation.readOnly?' · Samo pregled':''}`}>
                    <time>{formatBusinessTime(item.reservation.startTime)}–{formatBusinessTime(item.reservation.endTime)}</time><strong>{item.reservation.customerName}</strong>
                    <small>{reservationLabels[item.reservation.status]}</small>
                  </button> : <div key={item.key} tabIndex={0} className="gm-calendar-time-event gm-calendar-session" style={{...position(item.start,item.end),top:`${item.lane*58+9}px`}}
                    title={`Aktivna gaming sesija · ${eventTime({startTime:new Date(item.start).toISOString(),endTime:new Date(item.end).toISOString()})}`}>
                    <time>{formatBusinessTime(new Date(item.start).toISOString())}–{formatBusinessTime(new Date(item.end).toISOString())}</time><strong>Gaming sesija</strong><small>Aktivna sesija</small>
                  </div>)}
                </div>
              </div>
            }))}
          </section>
        })}
        {!context.areas.length && <p className="gm-calendar-empty-zone" role="status">Nema zona i resursa za izabrane filtere.</p>}
        {showNow && <div className="gm-calendar-now-track" aria-hidden="true"><div className="gm-calendar-now" style={{left:`${percent(now)}%`}}/></div>}
      </div>
    </div>}
    {mobile && <div className="gm-calendar-mobile-agenda">
      {showNow && <p className="gm-calendar-mobile-now">Sada: {formatBusinessTime(new Date(now).toISOString())} · Europe/Belgrade</p>}
      {!context.areas.length && <p className="gm-calendar-empty-zone" role="status">Nema zona i resursa za izabrane filtere.</p>}
      {context.areas.map(area => <section key={area.id}><button type="button" className="gm-calendar-zone-toggle" aria-expanded={!collapsed.has(area.id)} onClick={() => toggle(area.id)}>
        <span aria-hidden="true">{collapsed.has(area.id)?'›':'⌄'}</span><strong>{area.locationName} / {area.name}</strong></button>
        {!collapsed.has(area.id) && ((model.resources.get(area.id)??[]).length ? (model.resources.get(area.id)??[]).map(resource => <article key={resource.id} className="gm-calendar-mobile-resource">
          <h3>{resource.code} <small>{resource.name}</small></h3>{resource.currentRestriction && <p className="gm-calendar-resource-restricted">Trenutno: {restrictionLabel(resource.currentRestriction)}</p>}
          <p className="gm-calendar-mobile-hours">Radno vreme: {(model.hours.get(resource.locationId)??[]).map(window=>`${formatBusinessTime(new Date(window.start).toISOString())}–${instantLabel(new Date(window.end).toISOString())}`).join(', ')||'Lokal je zatvoren.'}</p>
          {(model.byResource.get(resource.id)??[]).map(item => item.reservation ? <CalendarEvent key={item.key} item={item.reservation} onOpen={onOpen}/>
            : <div key={item.key} className="gm-calendar-agenda-event gm-calendar-session"><strong>Aktivna gaming sesija</strong><time>{eventTime({startTime:new Date(item.start).toISOString(),endTime:new Date(item.end).toISOString()})}</time></div>)}
          {!(model.byResource.get(resource.id)??[]).length && <p className="search-help">Nema prikazanih rezervacija ni aktivnih sesija.</p>}
          {(model.occupancy.get(resource.id)??[]).some(item=>item.kind==='RESERVATION') && <p className="gm-calendar-mobile-busy">Zauzeće resursa: {(model.occupancy.get(resource.id)??[]).filter(item=>item.kind==='RESERVATION').map(item=>eventTime(item)).join('; ')}</p>}
          {context.employeeBlocks.map((item,index) => <p key={index} className="gm-calendar-mobile-busy">{item.kind==='TIME_OFF'?'Odsustvo zaposlenog':'Zaposleni zauzet'}: {eventTime(item)}</p>)}
        </article>) : <p className="gm-calendar-empty-zone">Nema resursa u ovoj zoni za izabrani opseg i filtere.</p>)}
      </section>)}
    </div>}
    {model.unassigned.length > 0 && <section className="gm-calendar-unassigned"><h3>Rezervacije bez dodeljenog resursa</h3>
      <p className="search-help">Ovi termini nisu raspoređeni na računar. Obavezni resurs dodelite kroz detalje rezervacije.</p>
      <div>{model.unassigned.map(item => <CalendarEvent key={item.id} item={item} onOpen={onOpen}/>)}</div>
    </section>}
  </>
}
