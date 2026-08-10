import { useEffect, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { notificationApi } from '../api/notificationApi'
import { Button, Skeleton } from '../components/ui'
import type { NotificationPreference } from '../types/notification.types'

export function NotificationPreferencesPage() {
  const [items, setItems] = useState<NotificationPreference[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  useEffect(() => { void notificationApi.preferences().then(setItems).catch((cause) => setError(apiErrorMessage(cause, 'Preference nisu dostupne.'))).finally(() => setLoading(false)) }, [])
  async function update(item: NotificationPreference, changes: Partial<NotificationPreference>) { const next = { ...item, ...changes }; const previous = items
    setItems((values) => values.map((value) => value.type === item.type ? next : value)); try { const saved = await notificationApi.savePreference(next); setItems((values) => values.map((value) => value.type === saved.type ? saved : value)) }
    catch (cause) { setItems(previous); setError(apiErrorMessage(cause, 'Preference nisu sačuvane.')) } }
  return <main className="workspace"><div className="page-heading"><div><p className="eyebrow">Lični kanali</p><h1>Podešavanja obaveštenja</h1></div></div>
    {error && <p role="alert" className="error-banner">{error}</p>}{loading ? <Skeleton lines={5} label="Učitavanje preference" /> :
      <section className="panel notification-preferences">{items.map((item) => <div className="preference-row" key={item.type}><div><strong>{item.type}</strong>{item.mandatory && <p>Obavezno bezbednosno obaveštenje — kanali se ne mogu isključiti.</p>}</div>
        <label className="inline-toggle"><input type="checkbox" checked={item.inAppEnabled} disabled={item.mandatory} onChange={(event) => void update(item, { inAppEnabled: event.target.checked })} />In-app</label>
        <label className="inline-toggle"><input type="checkbox" checked={item.emailEnabled} disabled={item.mandatory} onChange={(event) => void update(item, { emailEnabled: event.target.checked })} />Email</label></div>)}</section>}
    <Button type="button" variant="secondary" onClick={() => history.back()}>Nazad</Button></main>
}
