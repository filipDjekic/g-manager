import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gamingTimeApi } from '../api/gamingTimeApi'
import { apiErrorMessage } from '../api/client'
import { Alert, Button, Input, Skeleton } from '../components/ui'

export function GamingTimeSettings() {
  const client = useQueryClient(), [draft, setDraft] = useState<string | null>(null)
  const price = useQuery({ queryKey: ['gaming-time', 'price'], queryFn: gamingTimeApi.price })
  const save = useMutation({ mutationFn: gamingTimeApi.savePrice, onSuccess: data => { client.setQueryData(['gaming-time', 'price'], data); setDraft(null) }, onError: () => { void price.refetch() } })
  const value = draft ?? String(price.data?.pricePerMinute ?? '')
  const valid = /^\d{1,10}(?:\.\d{1,2})?$/.test(value) && Number(value) > 0
  return <section className="ui-card"><h2>Cena gaming minuta</h2>
    {price.isLoading && <Skeleton lines={2} />}
    {price.error && <Alert tone="danger">Cena nije dostupna. <Button onClick={() => void price.refetch()}>Osveži</Button></Alert>}
    {save.error && <Alert tone="danger">{apiErrorMessage(save.error, 'Cena nije sačuvana.')}</Alert>}
    {save.isSuccess && <Alert tone="success">Cena je sačuvana.</Alert>}
    {price.data && <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); if (valid) save.mutate({ pricePerMinute: value, version: price.data.version }) }}>
      <label>Cena po minutu (RSD)<Input required type="number" min="0.01" max="9999999999.99" step="0.01" value={value} disabled={save.isPending} onChange={e => setDraft(e.target.value)} /></label>
      <Button type="submit" disabled={!valid || save.isPending} loading={save.isPending}>Sačuvaj cenu</Button>
    </form>}
  </section>
}
