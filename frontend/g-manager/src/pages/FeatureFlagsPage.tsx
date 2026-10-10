import { useEffect, useState } from 'react'
import { featureApi } from '../api/featureApi'
import { apiErrorMessage } from '../api/client'
import { Badge, Button, Card, ErrorState, PageHeader, Select, Skeleton } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import type { FeatureFlagState } from '../types/feature.types'
import { useFeatureStore } from '../feature/featureStore'

export function FeatureFlagsPage() {
  const [items, setItems] = useState<FeatureFlagState[]>([])
  const [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const apply = useFeatureStore((state) => state.apply)
  const { confirm, confirmationDialog } = useConfirmDialog()
  const toast = useToast()
  async function refresh() {
    try { setItems(await featureApi.list()); setError('') }
    catch (cause) { setError(apiErrorMessage(cause, 'Feature flags nisu dostupni.')) }
    finally { setLoading(false) }
  }
  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(initial) }, [])
  function update(item: FeatureFlagState, enabled: boolean, rolloutPercentage: number) {
    confirm({ title: 'Promeni dostupnost funkcije', description: `${item.key}: ${enabled ? 'uključeno' : 'isključeno'} za ${rolloutPercentage}% korisnika.`,
      variant: 'warning', confirmLabel: 'Sačuvaj promenu', reasonLabel: 'Razlog promene', reasonRequired: true,
      disabled: !Number.isInteger(rolloutPercentage) || rolloutPercentage < 0 || rolloutPercentage > 100,
      errorMessage: 'Feature flag nije sačuvan.', onConfirm: async (reason) => {
        const changed = await featureApi.update(item.key, { enabled, rolloutPercentage, expiresAt: null, reason: reason!, version: item.version })
        const next = items.map((value) => value.key === changed.key ? changed : value)
        setItems(next); apply(next); toast('Dostupnost funkcije je ažurirana.', 'success')
      } })
  }
  return <main className="workspace">{confirmationDialog}<PageHeader eyebrow="Kontrola dostupnosti" title="Feature flags" />
    {error && <ErrorState message={error} action={<Button variant="secondary" onClick={() => void refresh()}>Osveži</Button>} />}
    {loading ? <Skeleton lines={4} /> : <div className="panel-grid">{items.map((item) => <Card key={item.key}>
      <div className="section-heading"><h2>{item.key}</h2><Badge tone={item.enabled ? 'success' : 'neutral'}>{item.enabled ? 'Uključeno' : 'Isključeno'}</Badge></div>
      <p>Odgovorna osoba: {item.owner} · pregled do {item.reviewBy}</p>
      <small>{item.overridden ? 'Prilagođena konfiguracija' : 'Podrazumevana konfiguracija'}</small>
      <label>Status<Select value={String(item.enabled)} onChange={(event) => update(item, event.target.value === 'true', item.rolloutPercentage)}>
        <option value="true">Uključeno</option><option value="false">Isključeno</option></Select></label>
      <label>Udeo korisnika (%)<input type="number" min="0" max="100" value={item.rolloutPercentage}
        onChange={(event) => setItems((current) => current.map((value) => value.key === item.key ? { ...value, rolloutPercentage: Number(event.target.value) } : value))} /></label>
      <Button variant="secondary" onClick={() => update(item, item.enabled, item.rolloutPercentage)}>Sačuvaj udeo</Button>
    </Card>)}</div>}
  </main>
}
