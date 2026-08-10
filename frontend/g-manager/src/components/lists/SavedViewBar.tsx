import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { savedViewApi, type SavedViewResource } from '../../api/savedViewApi'
import { queryKeys } from '../../query/queryKeys'
import { Button, Select } from '../ui'
import { useToast } from '../ui/toastContext'

export function SavedViewBar({ resource, query, apply }: {
  resource: SavedViewResource; query: Record<string, string>; apply: (query: Record<string, string>) => void
}) {
  const client = useQueryClient()
  const toast = useToast()
  const [selectedId, setSelectedId] = useState('')
  const views = useQuery({ queryKey: queryKeys.savedViews(resource), queryFn: () => savedViewApi.list(resource) })
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.savedViews(resource) })
  const create = useMutation({ mutationFn: async () => {
    const name = window.prompt('Naziv sačuvanog prikaza:')?.trim()
    if (!name) return
    await savedViewApi.create(resource, name, query)
  }, onSuccess: async () => { await refresh(); toast('Prikaz je sačuvan.', 'success') } })
  const remove = useMutation({ mutationFn: async () => {
    const view = views.data?.find(({ id }) => id === selectedId)
    if (view) await savedViewApi.remove(view)
  }, onSuccess: async () => { setSelectedId(''); await refresh(); toast('Sačuvani prikaz je obrisan.', 'success') } })
  const selected = views.data?.find(({ id }) => id === selectedId)

  return <div className="saved-view-bar" aria-label="Sačuvani prikazi">
    <label>Sačuvani prikaz<Select value={selectedId} onChange={(event) => {
      setSelectedId(event.target.value)
      const view = views.data?.find(({ id }) => id === event.target.value)
      if (view) apply(view.query)
    }}><option value="">Izaberi</option>{views.data?.map((view) =>
      <option key={view.id} value={view.id}>{view.name}</option>)}</Select></label>
    <Button type="button" variant="secondary" loading={create.isPending} onClick={() => create.mutate()}>Sačuvaj prikaz</Button>
    {selected && <Button type="button" variant="danger" loading={remove.isPending}
      onClick={() => remove.mutate()}>Obriši prikaz</Button>}
  </div>
}
