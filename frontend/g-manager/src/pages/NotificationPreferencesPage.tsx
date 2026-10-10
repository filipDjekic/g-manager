import { useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { notificationApi } from '../api/notificationApi'
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import type { NotificationPreference, NotificationType } from '../types/notification.types'

const labels: Record<NotificationType, string> = {
  SECURITY_SESSION_STARTED: 'Nova prijava na nalog', SECURITY_PASSWORD_CHANGED: 'Promena lozinke',
  RESERVATION_CREATED: 'Nova rezervacija', RESERVATION_STATUS_CHANGED: 'Promena statusa rezervacije',
  ORDER_CREATED: 'Nova narudžbina', ORDER_STATUS_CHANGED: 'Promena statusa narudžbine',
  REPORT_COMPLETED: 'Završen izveštaj', WORKFLOW_ACTION_REQUIRED: 'Proces zahteva odluku',
  WORKFLOW_REMINDER: 'Podsetnik za proces', WORKFLOW_ESCALATED: 'Eskalacija procesa', WORKFLOW_COMPLETED: 'Završen proces',
}

export function NotificationPreferencesPage() {
  const [items, setItems] = useState<NotificationPreference[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState<Set<NotificationType>>(new Set())
  const inFlight = useRef(new Set<NotificationType>())
  const toast = useToast()
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    void notificationApi.preferences().then((values) => { if (active) setItems(values) })
      .catch((cause) => { if (active) setError(apiErrorMessage(cause, 'Podešavanja nisu dostupna.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadAttempt])

  async function update(item: NotificationPreference, changes: Partial<NotificationPreference>) {
    if (item.mandatory || inFlight.current.has(item.type)) return
    inFlight.current.add(item.type); setSaving(new Set(inFlight.current)); setError('')
    const next = { ...item, ...changes }
    setItems((values) => values.map((value) => value.type === item.type ? next : value))
    try {
      const saved = await notificationApi.savePreference(next)
      setItems((values) => values.map((value) => value.type === saved.type ? saved : value))
      toast('Podešavanje obaveštenja je sačuvano.', 'success')
    } catch (cause) {
      setItems((values) => values.map((value) => value.type === item.type ? item : value))
      setError(apiErrorMessage(cause, 'Podešavanje nije sačuvano.'))
    } finally { inFlight.current.delete(item.type); setSaving(new Set(inFlight.current)) }
  }

  return <main className="workspace">
    <div className="page-heading"><div><p className="eyebrow">Moj nalog</p><h1>Podešavanja obaveštenja</h1>
      <p>Izaberite kanale za svaku vrstu obaveštenja. Izmene se čuvaju odmah.</p></div></div>
    {error && <ErrorState message={error} action={!items.length && <Button onClick={() => setLoadAttempt((value) => value + 1)}>Pokušaj ponovo</Button>} />}
    {loading ? <Skeleton lines={5} label="Učitavanje podešavanja obaveštenja" /> : !items.length && !error ?
      <EmptyState title="Nema podešavanja obaveštenja" /> : !!items.length &&
      <section className="panel notification-preferences">{items.map((item) =>
        <div className="preference-row" key={item.type} aria-busy={saving.has(item.type)}>
          <div><strong>{labels[item.type]}</strong>{item.mandatory && <p>Obavezno bezbednosno obaveštenje — kanali se ne mogu isključiti.</p>}
            {saving.has(item.type) && <Badge tone="info">Čuvanje…</Badge>}</div>
          <label className="inline-toggle"><input type="checkbox" checked={item.inAppEnabled} disabled={item.mandatory || saving.has(item.type)}
            onChange={(event) => void update(item, { inAppEnabled: event.target.checked })} />U aplikaciji</label>
          <label className="inline-toggle"><input type="checkbox" checked={item.emailEnabled} disabled={item.mandatory || saving.has(item.type)}
            onChange={(event) => void update(item, { emailEnabled: event.target.checked })} />Email</label>
        </div>)}</section>}
    <Button type="button" variant="secondary" onClick={() => history.back()}>Nazad</Button>
  </main>
}
