import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { notificationApi } from '../api/notificationApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Button, Card, EmptyState, ErrorState, PageLayout } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { NotificationChannels, NotificationIcon, NotificationPreferencesHeading, NotificationPreferencesLoading, NotificationTypes } from '../notification/NotificationPreferenceControls'
import { activePreferences, changedPreferences, mergePreferences, normalizePreference, type NotificationChannel } from '../notification/notificationPreferences'
import type { NotificationPreference, NotificationType } from '../types/notification.types'
import '../notification/notificationPreferences.css'

export function NotificationPreferencesPage() {
  const actor = useAuthStore(state => state.user)
  if (!actor || !hasCapability(actor, 'PROFILE_READ')) return <PageLayout className="gm-notification-preferences">
    <NotificationPreferencesHeading />
    <ErrorState title="Pristup nije dozvoljen" message="Nemate dozvolu za pregled podešavanja obaveštenja." />
  </PageLayout>
  return <PreferencesWorkspace key={actor.id} actorId={actor.id} />
}

function PreferencesWorkspace({ actorId }: { actorId: string }) {
  const navigate = useNavigate()
  const [saved, setSaved] = useState<NotificationPreference[]>([])
  const [draft, setDraft] = useState<NotificationPreference[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [failures, setFailures] = useState<Partial<Record<NotificationType, string>>>({})
  const inFlight = useRef(false), mounted = useRef(true)
  const toast = useToast()
  const { confirm, confirmationDialog } = useConfirmDialog()
  const changes = changedPreferences(saved, draft)
  const dirty = changes.length > 0
  const changedTypes = new Set(changes.map(value => value.type))

  useDirtyGuard(dirty || saving, { pending: saving })
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    let active = true
    const current = () => active && useAuthStore.getState().user?.id === actorId
    // Explicit reload starts a new external request and clears the previous failure before its asynchronous response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setLoadError('')
    void notificationApi.preferences().then(values => {
      if (!current()) return
      const preferences = activePreferences(values)
      setSaved(preferences); setDraft(preferences)
    }).catch(cause => {
      if (current()) setLoadError(apiErrorMessage(cause, 'Podešavanja nisu dostupna.'))
    }).finally(() => { if (current()) setLoading(false) })
    return () => { active = false }
  }, [actorId, loadAttempt])

  function update(type: NotificationType, channel: NotificationChannel, value: boolean) {
    if (inFlight.current) return
    setDraft(items => items.map(item => item.type === type && !item.mandatory ? { ...item, [channel]: value } : item))
    setSaveError('')
    setFailures(current => { const next = { ...current }; delete next[type]; return next })
  }

  function updateChannel(channel: NotificationChannel, value: boolean) {
    if (inFlight.current) return
    setDraft(items => items.map(item => item.mandatory ? item : { ...item, [channel]: value }))
    setSaveError(''); setFailures({})
  }

  async function save() {
    if (inFlight.current || loading || !changes.length) return
    inFlight.current = true
    setSaving(true); setSaveError(''); setFailures({})
    try {
      const results = await Promise.allSettled(changes.map(async item => {
        const result = await notificationApi.savePreference(item)
        if (result.type !== item.type) throw new Error('Unexpected notification preference response')
        return normalizePreference(result)
      }))
      if (!mounted.current || useAuthStore.getState().user?.id !== actorId) return
      const confirmed: NotificationPreference[] = []
      const errors: Partial<Record<NotificationType, string>> = {}
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') confirmed.push(result.value)
        else errors[changes[index].type] = apiErrorMessage(result.reason,
          'Server nije potvrdio čuvanje ove vrste obaveštenja. Pokušajte ponovo.')
      })
      // Each PUT is independent: merge only acknowledged results into both snapshots.
      setSaved(current => mergePreferences(current, confirmed))
      setDraft(current => mergePreferences(current, confirmed))
      setFailures(errors)
      if (confirmed.length === changes.length) {
        toast('Podešavanja obaveštenja su sačuvana.', 'success')
      } else {
        const message = confirmed.length
          ? `Sačuvano je ${confirmed.length} od ${changes.length} izmenjenih vrsta obaveštenja. Preostale izmene nisu sačuvane. Pokušajte ponovo.`
          : 'Podešavanja nisu sačuvana. Pokušajte ponovo.'
        setSaveError(message); toast(message, 'error')
      }
    } finally {
      inFlight.current = false
      if (mounted.current && useAuthStore.getState().user?.id === actorId) setSaving(false)
    }
  }

  function discard() {
    if (!dirty || inFlight.current) return
    confirm({
      title: 'Odbaci nesačuvane izmene?', description: 'Biće vraćena poslednja potvrđena podešavanja obaveštenja.',
      confirmLabel: 'Odbaci izmene', cancelLabel: 'Zadrži izmene', variant: 'warning',
      titleIcon: <NotificationIcon kind="bell" />,
      onConfirm: () => { if (!inFlight.current) { setDraft(saved); setSaveError(''); setFailures({}) } },
    })
  }

  return <PageLayout className="gm-notification-preferences">
    <NotificationPreferencesHeading actions={<Button type="button" variant="secondary" disabled={saving}
      onClick={() => navigate(-1)}><NotificationIcon kind="arrow" />Nazad</Button>} />
    <div className="gm-notification-draft-status" role="status" aria-live="polite" data-dirty={dirty}>
      <span>{saving ? 'Čuvanje podešavanja…' : dirty ? `Nesačuvane izmene: ${changes.length}.`
        : loading ? 'Učitavanje podešavanja…' : loadError ? 'Podešavanja nisu dostupna.' : 'Nema nesačuvanih izmena.'}</span>
      {dirty && <Button type="button" variant="secondary" disabled={saving} onClick={discard}>Odbaci izmene</Button>}
    </div>
    {saveError && <ErrorState title="Čuvanje podešavanja" message={saveError} />}
    {loading ? <NotificationPreferencesLoading /> : loadError ?
      <Card className="gm-notification-card"><ErrorState title="Podešavanja nisu dostupna" message={loadError}
        action={<Button type="button" variant="secondary" onClick={() => setLoadAttempt(value => value + 1)}>Pokušaj ponovo</Button>} /></Card>
      : !draft.length ? <Card className="gm-notification-card"><EmptyState title="Trenutno nema dostupnih podešavanja obaveštenja." /></Card>
      : <>
        <NotificationChannels items={draft} saving={saving} onChange={updateChannel} />
        <NotificationTypes items={draft} changed={changedTypes} failures={failures} saving={saving} onChange={update} />
      </>}
    <Card className="gm-notification-card gm-notification-delivery">
      <span className="gm-notification-delivery-icon"><NotificationIcon kind="info" /></span>
      <div><h2>O isporuci obaveštenja</h2>
        <p>Uključen email kanal ne garantuje isporuku poruke. Obavezna bezbednosna obaveštenja ostaju uključena.</p>
      </div>
    </Card>
    <div className="gm-notification-footer" data-dirty={dirty}>
      {dirty && <Button type="button" className="gm-notification-save" loading={saving} disabled={loading || !dirty}
        onClick={() => void save()}><NotificationIcon kind="save" />Sačuvaj promene</Button>}
    </div>
    {confirmationDialog}
  </PageLayout>
}
