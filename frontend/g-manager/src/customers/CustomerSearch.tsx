import { useEffect, useRef, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { customerApi } from '../api/customerApi'
import { Button, EmptyState, ErrorState, Input, Pagination, Skeleton } from '../components/ui'

export interface CustomerChoice { id: string; name: string; email?: string }
export function CustomerSearch({ selected, onSelect, disabled, onCreate, activeOnly = true, inputRef }: {
  selected?: CustomerChoice | null; onSelect: (value: CustomerChoice) => void; disabled?: boolean
  onCreate?: () => void; activeOnly?: boolean; inputRef?: RefObject<HTMLInputElement | null>
}) {
  const [search, setSearch] = useState(''), [debounced, setDebounced] = useState(''), [page, setPage] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { const timer = window.setTimeout(() => { setDebounced(search.trim()); setPage(0) }, 250); return () => window.clearTimeout(timer) }, [search])
  const result = useQuery({ queryKey: ['customers', 'quick-search', debounced, page, activeOnly],
    queryFn: () => customerApi.list({ search: debounced || undefined, active: activeOnly ? true : undefined, page, size: 8 }) })
  const searching = search.trim() !== debounced
  return <section className="ui-customer-search" aria-label="Izbor klijenta">
    <label>Pronađi klijenta<Input ref={inputRef ?? input} type="search" autoFocus maxLength={120} disabled={disabled}
      placeholder="Ime ili email" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {selected && <p className="selected-customer"><strong>{selected.name}</strong><small>{selected.email}</small></p>}
    {result.isLoading ? <Skeleton lines={2} /> : result.error ? <ErrorState message="Pretraga klijenata nije dostupna."
      action={<Button variant="secondary" onClick={() => result.refetch()}>Pokušaj ponovo</Button>} /> : !result.data?.content.length
      ? <EmptyState title="Nema klijenata za ovu pretragu" description="Promenite pretragu ili kreirajte novog klijenta." />
      : <div className="gaming-customer-results">{result.data.content.map(value => <Button key={value.id} variant="ghost"
        disabled={disabled || searching || activeOnly && !value.active} aria-pressed={selected?.id === value.id}
        onClick={() => onSelect(value)}><strong>{value.name}</strong><small>{value.email}{!value.active && ' · Neaktivan'}</small></Button>)}</div>}
    {result.data && result.data.totalPages > 1 && <Pagination page={page} totalPages={result.data.totalPages}
      loading={result.isFetching || searching} onPageChange={setPage} />}
    {onCreate && <Button variant="secondary" disabled={disabled} onClick={onCreate}>+ Novi klijent</Button>}
  </section>
}
