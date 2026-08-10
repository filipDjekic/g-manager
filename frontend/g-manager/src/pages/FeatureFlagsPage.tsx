import { useEffect, useState } from 'react'
import { featureApi } from '../api/featureApi'
import { apiErrorMessage } from '../api/client'
import { Button, Card, ErrorState, PageHeader, Select, Skeleton } from '../components/ui'
import type { FeatureFlagState } from '../types/feature.types'
import { useFeatureStore } from '../feature/featureStore'
export function FeatureFlagsPage() {
  const [items, setItems] = useState<FeatureFlagState[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const apply = useFeatureStore((state) => state.apply)
  async function refresh() { try { setItems(await featureApi.list()); setError('') } catch (cause) { setError(apiErrorMessage(cause, 'Feature flags nisu dostupni.')) } finally { setLoading(false) } }
  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(initial) }, [])
  async function update(item: FeatureFlagState, enabled: boolean, rolloutPercentage: number) { const reason = window.prompt('Obavezan razlog promene feature flag-a')?.trim(); if (!reason) return; try { const changed = await featureApi.update(item.key, { enabled, rolloutPercentage, expiresAt: null, reason, version: item.version }); const next = items.map((value) => value.key === changed.key ? changed : value); setItems(next); apply(next) } catch (cause) { setError(apiErrorMessage(cause, 'Feature flag nije sačuvan.')) } }
  return <main><PageHeader eyebrow="Kontrolisani rollout" title="Feature flags" />{error && <ErrorState message={error} action={<Button variant="secondary" onClick={() => void refresh()}>Osveži</Button>} />}{loading ? <Skeleton lines={4} /> : items.map((item) => <Card key={item.key}><h2>{item.key}</h2><p>Owner: {item.owner} · review do {item.reviewBy} · {item.overridden ? 'runtime override' : 'typed default'}</p><label>Status<Select value={String(item.enabled)} onChange={(event) => void update(item, event.target.value === 'true', item.rolloutPercentage)}><option value="true">Uključeno</option><option value="false">Isključeno</option></Select></label><label>Rollout %<input type="number" min="0" max="100" value={item.rolloutPercentage} onChange={(event) => setItems((current) => current.map((value) => value.key === item.key ? { ...value, rolloutPercentage: Number(event.target.value) } : value))} /></label><Button variant="secondary" onClick={() => void update(item, item.enabled, item.rolloutPercentage)}>Sačuvaj rollout</Button></Card>)}</main>
}
