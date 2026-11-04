import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { connectNotificationStream, notificationApi } from '../api/notificationApi'
import { Button, EmptyState, Modal, Pagination, Skeleton, Alert } from '../components/ui'
import { NavigationIcon } from '../layout/NavigationIcon'
import type { AppNotification } from '../types/notification.types'
import './notificationCenter.css'

function relative(value: string) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000); const absolute = Math.abs(seconds)
  const formatter = new Intl.RelativeTimeFormat('sr-Latn', { numeric: 'auto' })
  if (absolute < 60) return formatter.format(seconds, 'second')
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), 'hour')
  return formatter.format(Math.round(seconds / 86400), 'day')
}


function iconFor(type: AppNotification['type']) {
  if (type.startsWith('SECURITY_')) return '/sessions'
  if (type.startsWith('RESERVATION_')) return '/calendar'
  if (type.startsWith('ORDER_')) return '/orders'
  if (type.startsWith('WAITLIST_')) return '/waitlist'
  if (type === 'REPORT_COMPLETED') return '/reports'
  return '/notification-preferences'
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [page, setPage] = useState(0)
  const [metadata, setMetadata] = useState({ totalPages: 0, totalElements: 0 })
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)
  const [connection, setConnection] = useState<'connected' | 'reconnecting' | 'offline'>('reconnecting')
  const [announcement, setAnnouncement] = useState('')
  const request = useRef(0)
  const mutation = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const refresh = () => setRevision(value => value + 1)

  useEffect(() => {
    if (pending) return
    const id = ++request.current
    let active = true
    void notificationApi.list(page).then(result => {
      if (!active || id !== request.current) return
      setLoadError('')
      setItems(result.notifications)
      setUnread(result.unreadCount)
      setMetadata({ totalPages: result.totalPages, totalElements: result.totalElements })
      if (result.page !== page) setPage(result.page)
    }).catch(cause => {
      if (active && id === request.current) setLoadError(apiErrorMessage(cause, 'Obaveštenja trenutno nisu dostupna.'))
    }).finally(() => { if (active && id === request.current) setLoading(false) })
    return () => { active = false }
  }, [page, revision, pending])

  useEffect(() => {
    // Coalesce replay bursts and always fetch authoritative counts and the current page.
    let timer: number | undefined
    const disconnect = connectNotificationStream(value => {
      setAnnouncement(`Novo obaveštenje: ${value.title}`)
      window.clearTimeout(timer)
      timer = window.setTimeout(refresh, 150)
    }, setConnection)
    return () => { window.clearTimeout(timer); disconnect() }
  }, [])
  useEffect(() => {
    if (connection === 'connected') { refresh(); return }
    const timer = window.setInterval(refresh, 30000)
    return () => window.clearInterval(timer)
  }, [connection])
  useEffect(() => {
    if (!announcement) return
    const timer = window.setTimeout(() => setAnnouncement(''), 1500)
    return () => window.clearTimeout(timer)
  }, [announcement])
  const groups = useMemo(() => items.reduce<Record<string, AppNotification[]>>((result, item) => {
    const day = new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: 'Europe/Belgrade', dateStyle: 'long' }).format(new Date(item.createdAt))
    ;(result[day] ??= []).push(item)
    return result
  }, {}), [items])

  async function markRead(item: AppNotification) {
    if (item.read) return true
    if (mutation.current) return false
    mutation.current = true; ++request.current; setPending(true)
    setItems(current => current.map(value => value.id === item.id ? { ...value, read: true } : value))
    setUnread(count => Math.max(0, count - 1))
    try { await notificationApi.read(item.id); setError(''); return true }
    catch (cause) {
      setItems(current => current.map(value => value.id === item.id ? { ...value, read: false } : value))
      setUnread(count => count + 1)
      setError(apiErrorMessage(cause, 'Status čitanja nije sačuvan.'))
      return false
    } finally { mutation.current = false; setPending(false); setLoading(false) }
  }
  async function openItem(item: AppNotification) {
    if (!await markRead(item)) return
    try { const { action } = await notificationApi.open(item.id); setOpen(false); navigate(action.url) }
    catch (cause) { setError(apiErrorMessage(cause, 'Povezani resurs više nije dostupan.')) }
  }
  async function readAll() {
    if (mutation.current) return
    mutation.current = true; ++request.current; setPending(true)
    const previous = items; const previousUnread = unread
    setItems(current => current.map(item => ({ ...item, read: true }))); setUnread(0)
    try { await notificationApi.readAll(); setError('') }
    catch (cause) {
      setItems(previous); setUnread(previousUnread)
      setError(apiErrorMessage(cause, 'Obaveštenja nisu označena kao pročitana.'))
    } finally { mutation.current = false; setPending(false); setLoading(false) }
  }
  function changePage(next: number) {
    if (next === page) return
    setLoading(true); setError(''); setLoadError(''); setItems([]); setPage(next)
    listRef.current?.scrollTo?.({ top: 0 })
  }

  return <>
    <Button iconOnly type="button" variant="secondary" className="notification-bell" onClick={() => { setOpen(true); setError(''); refresh() }}
      aria-label={`Obaveštenja, ${unread} nepročitanih`}><NavigationIcon to="/notification-preferences" />
      {unread > 0 && <span aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}</Button>
    <span className="sr-only" aria-live="polite">{announcement}</span>
    <Modal open={open} title="Obaveštenja" titleIcon={<NavigationIcon to="/notification-preferences" />}
      className="notification-dialog" onClose={() => setOpen(false)} footer={<>
        <Pagination page={page} totalPages={metadata.totalPages} totalElements={metadata.totalElements} pageSize={5}
          numbered loading={loading} disabled={pending} onPageChange={changePage} label="Stranice obaveštenja" />
        <Link to="/notification-preferences" onClick={() => setOpen(false)}>Podešavanja obaveštenja</Link>
      </>}>
      <div className="notification-center">
        <div className="notification-toolbar">
          <span className={`connection-state ${connection}`}>{connection === 'connected' ? 'Uživo' : connection === 'offline' ? 'Bez veze · periodično osvežavanje' : 'Ponovno povezivanje · periodično osvežavanje'}</span>
          <Button type="button" variant="secondary" disabled={!unread || pending || loading} onClick={() => void readAll()}>Pročitaj sve</Button>
        </div>
        <div className="notification-list" ref={listRef} aria-busy={loading || pending}>
          {(error || loadError) && <Alert tone="danger" role="alert">{error || loadError}<Button variant="ghost" onClick={() => { setError(''); setLoading(true); refresh() }}>Pokušaj ponovo</Button></Alert>}
          {loading ? <Skeleton lines={5} label="Učitavanje obaveštenja" /> : <>
            {!error && !loadError && !items.length && <EmptyState title="Nema obaveštenja" description="Nova obaveštenja će se pojaviti ovde." />}
            {Object.entries(groups).map(([day, values]) => <Fragment key={day}>
              <h3>{day}</h3>
              {values.map(item => <article className={`notification-item ${item.read ? 'read' : 'unread'} notification-priority-${item.priority.toLowerCase()}`} key={item.id}>
                <span className="notification-type-icon"><NavigationIcon to={iconFor(item.type)} /></span>
                <div className="notification-content">
                  <span className={`priority ${item.priority.toLowerCase()}`}>{{ HIGH: 'Visok prioritet', NORMAL: 'Srednji prioritet', LOW: 'Nizak prioritet' }[item.priority]}</span>
                  {item.action ? <Button variant="ghost" className="notification-title" type="button" disabled={pending} aria-label={`${item.action.label}: ${item.title}`} onClick={() => void openItem(item)}><strong>{item.title}</strong></Button> : <strong>{item.title}</strong>}
                  <p>{item.body}</p>
                  <div className="notification-item-footer"><time dateTime={item.createdAt} title={new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: 'Europe/Belgrade', dateStyle: 'full', timeStyle: 'medium' }).format(new Date(item.createdAt))}>{relative(item.createdAt)}</time>
                    {!item.read ? <Button type="button" variant="ghost" disabled={pending} onClick={() => void markRead(item)}>Označi pročitano</Button> : <span className="notification-read-label">Pročitano</span>}
                  </div>
                </div>
                {!item.read && <span className="notification-unread-dot" role="img" aria-label="Nepročitano" />}
              </article>)}
            </Fragment>)}
          </>}
        </div>
      </div>
    </Modal>
  </>
}
