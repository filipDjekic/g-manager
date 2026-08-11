import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { connectNotificationStream, notificationApi } from '../api/notificationApi'
import { Button, Modal, Skeleton } from '../components/ui'
import type { AppNotification } from '../types/notification.types'

function relative(value: string) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000); const absolute = Math.abs(seconds)
  const formatter = new Intl.RelativeTimeFormat('sr', { numeric: 'auto' })
  if (absolute < 60) return formatter.format(seconds, 'second')
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), 'hour')
  return formatter.format(Math.round(seconds / 86400), 'day')
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false); const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0); const [loading, setLoading] = useState(true)
  const [error, setError] = useState(''); const [connection, setConnection] = useState<'connected' | 'reconnecting' | 'offline'>('reconnecting')
  const [announcement, setAnnouncement] = useState(''); const seenIds = useRef(new Set<string>()); const navigate = useNavigate()
  async function refresh() { try { const page = await notificationApi.list(); seenIds.current = new Set(page.notifications.map((item) => item.id)); setItems(page.notifications); setUnread(page.unreadCount); setError('') }
    catch (cause) { setError(apiErrorMessage(cause, 'Obaveštenja trenutno nisu dostupna.')) } finally { setLoading(false) } }
  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); const disconnect = connectNotificationStream((value) => {
    if (seenIds.current.has(value.id)) return
    seenIds.current.add(value.id); setItems((current) => [value, ...current].slice(0, 50))
    if (!value.read) setUnread((count) => count + 1); setAnnouncement(`Novo obaveštenje: ${value.title}`)
  }, setConnection); return () => { window.clearTimeout(initial); disconnect() } }, [])
  useEffect(() => { if (connection === 'connected') return; const timer = window.setInterval(() => void refresh(), 30000); return () => window.clearInterval(timer) }, [connection])
  useEffect(() => { if (!announcement) return; const timer = window.setTimeout(() => setAnnouncement(''), 1500); return () => window.clearTimeout(timer) }, [announcement])
  const groups = useMemo(() => items.reduce<Record<string, AppNotification[]>>((result, item) => {
    const day = new Intl.DateTimeFormat('sr-RS', { dateStyle: 'long' }).format(new Date(item.createdAt)); (result[day] ??= []).push(item); return result
  }, {}), [items])
  async function markRead(item: AppNotification) { if (item.read) return; setItems((current) => current.map((value) => value.id === item.id ? { ...value, read: true } : value)); setUnread((count) => Math.max(0, count - 1))
    try { await notificationApi.read(item.id) } catch (cause) { setItems((current) => current.map((value) => value.id === item.id ? { ...value, read: false } : value)); setUnread((count) => count + 1); setError(apiErrorMessage(cause, 'Status čitanja nije sačuvan.')) } }
  async function openItem(item: AppNotification) { await markRead(item); try { const { action } = await notificationApi.open(item.id); setOpen(false); navigate(action.url) }
    catch (cause) { setError(apiErrorMessage(cause, 'Povezani resurs više nije dostupan.')) } }
  async function readAll() { const previous = items; const previousUnread = unread; setItems((current) => current.map((item) => ({ ...item, read: true }))); setUnread(0)
    try { await notificationApi.readAll() } catch (cause) { setItems(previous); setUnread(previousUnread); setError(apiErrorMessage(cause, 'Obaveštenja nisu označena kao pročitana.')) } }

  return <><Button type="button" variant="secondary" className="notification-bell" onClick={() => setOpen(true)}
    aria-label={`Obaveštenja, ${unread} nepročitanih`}>🔔{unread > 0 && <span aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}</Button>
    <span className="sr-only" aria-live="polite">{announcement}</span>
    <Modal open={open} title="Obaveštenja" onClose={() => setOpen(false)}>
      <div className="notification-center"><div className="notification-toolbar"><span className={`connection-state ${connection}`}>{connection === 'connected' ? 'Uživo' : connection === 'offline' ? 'Offline · periodično osvežavanje' : 'Ponovno povezivanje · periodično osvežavanje'}</span>
        <Button type="button" variant="secondary" disabled={!unread} onClick={() => void readAll()}>Pročitaj sve</Button></div>
        {error && <p role="alert" className="error-banner">{error}</p>}{loading && <Skeleton lines={4} label="Učitavanje obaveštenja" />}
        {!loading && !items.length && <p className="empty-state">Nema obaveštenja.</p>}
        <div className="notification-list">{Object.entries(groups).map(([day, values]) => <Fragment key={day}><h3>{day}</h3>{values.map((item) =>
          <article className={`notification-item ${item.read ? '' : 'unread'}`} key={item.id}>{item.action ? <button type="button" aria-label={`${item.action.label}: ${item.title}`} onClick={() => void openItem(item)}>
            <span className={`priority ${item.priority.toLowerCase()}`}>{item.priority}</span><strong>{item.title}</strong><p>{item.body}</p>
            <time dateTime={item.createdAt} title={new Intl.DateTimeFormat('sr-RS', { dateStyle: 'full', timeStyle: 'medium' }).format(new Date(item.createdAt))}>{relative(item.createdAt)}</time></button> : <div><span className={`priority ${item.priority.toLowerCase()}`}>{item.priority}</span><strong>{item.title}</strong><p>{item.body}</p><time dateTime={item.createdAt}>{relative(item.createdAt)}</time></div>}
            {!item.read && <Button type="button" variant="secondary" onClick={() => void markRead(item)}>Označi pročitano</Button>}</article>)}</Fragment>)}</div>
        <Link to="/notification-preferences" onClick={() => setOpen(false)}>Podešavanja obaveštenja</Link>
      </div>
    </Modal></>
}
