import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { notificationApi } from '../api/notificationApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Button, Card, EmptyState, ErrorState } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { NotificationChannels, NotificationIcon, NotificationPreferencesHeading, NotificationPreferencesLoading, NotificationTypes } from '../notification/NotificationPreferenceControls'
import { activePreferences, changedPreferences, mergePreferences, normalizePreference, type NotificationChannel } from '../notification/notificationPreferences'
import type { NotificationPreference, NotificationType } from '../types/notification.types'
import '../notification/notificationPreferences.css'

export function NotificationPreferencesPage() {
  const actor = useAuthStore(state => state.user)
  if (!actor || !hasCapability(actor, 'PROFILE_READ')) return <main className="workspace workspace--reading gm-notification-preferences">
    <NotificationPreferencesHeading />
    <ErrorState title="Pristup nije dozvoljen" message="Nemate dozvolu za pregled podešavanja obaveštenja." />
  </main>
  return <PreferencesWorkspace key={actor.id} actorId={actor.id} />
}

function PreferencesWorkspace({ actorId }: { actorId: string }) {
  const [saved, setSaved] = useState<NotificationPreference[]>([])
  const [draft, setDraft] = useState<NotificationPreference[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [failures, setFailures] = useState<Partial<Record<NotificationType, string>>>({})
  const inFlight = useRef(false), mounted = useRef(true), allowLink = useRef(false)
  const toast = useToast(), navigate = useNavigate()
  const { confirm, confirmationDialog } = useConfirmDialog()
  const changes = changedPreferences(saved, draft)
  const dirty = changes.length > 0
  const changedTypes = new Set(changes.map(value => value.type))

  useDirtyGuard(dirty || saving)
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

  // Guard ordinary navigation links while this form has an unsaved draft.
  // Replaying the link preserves its existing router state and menu handlers.
  useEffect(() => {
    if (!dirty && !saving) return
    const guardLink = (event: MouseEvent) => {
      if (allowLink.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return
      event.preventDefault(); event.stopPropagation()
      if (inFlight.current) {
        toast('Sačekajte da se završi čuvanje podešavanja.', 'info')
        return
      }
      confirm({
        title: 'Napusti podešavanja obaveštenja?',
        description: 'Imate nesačuvane izmene. Ako nastavite, te izmene će biti odbačene.',
        confirmLabel: 'Napusti stranicu', cancelLabel: 'Ostani na stranici', variant: 'warning',
        titleIcon: <NotificationIcon kind="bell" />,
        onConfirm: () => {
          allowLink.current = true
          try {
            if (anchor.isConnected) anchor.click()
            else navigate(destination.pathname + destination.search + destination.hash)
          } finally { allowLink.current = false }
        },
      })
    }
    document.addEventListener('click', guardLink, true)
    return () => document.removeEventListener('click', guardLink, true)
  }, [dirty, saving, confirm, navigate, toast])

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

  function back() {
    if (inFlight.current) return
    if (!dirty) { navigate(-1); return }
    confirm({
      title: 'Napusti podešavanja obaveštenja?', description: 'Imate nesačuvane izmene. Ako nastavite, te izmene će biti odbačene.',
      confirmLabel: 'Napusti stranicu', cancelLabel: 'Ostani na stranici', variant: 'warning',
      titleIcon: <NotificationIcon kind="bell" />, onConfirm: () => { navigate(-1) },
    })
  }

  return <main className="workspace workspace--reading gm-notification-preferences">
    <NotificationPreferencesHeading actions={<Button type="button" className="gm-notification-save"
      loading={saving} disabled={loading || !dirty} onClick={() => void save()}>
      <NotificationIcon kind="save" />Sačuvaj promene
    </Button>} />
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
        <p>Obaveštenja u aplikaciji prikazuju se u G-Manager centru za obaveštenja. Email obaveštenja se šalju kada je email dostava dostupna i konfigurisana.</p>
        <p>Uključen email kanal ne garantuje isporuku poruke. Obavezna bezbednosna obaveštenja ostaju uključena.</p>
      </div>
    </Card>
    <div className="gm-notification-footer" data-dirty={dirty}>
      {dirty && <Button type="button" className="gm-notification-save" loading={saving} disabled={loading || !dirty}
        onClick={() => void save()}><NotificationIcon kind="save" />Sačuvaj promene</Button>}
      <Button type="button" variant="secondary" disabled={saving} onClick={back}><NotificationIcon kind="arrow" />Nazad</Button>
    </div>
    {confirmationDialog}
  </main>
}
