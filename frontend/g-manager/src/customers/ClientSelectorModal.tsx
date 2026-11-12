import { useEffect, useRef, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { customerApi } from '../api/customerApi'
import { useAuthStore } from '../auth/authStore'
import { Button, EmptyState, ErrorState, Input, Modal, Pagination, Skeleton, TableShell } from '../components/ui'
import type { CustomerListItem } from '../types/customer.types'
import './clientSelector.css'

const pageSizes = [5, 10, 20, 50]

export function ClientSelectorModal({ open, selectedId, onSelect, onClose, onClear, disabled = false, activeOnly = false, returnFocusRef }: {
  open: boolean; selectedId?: string; onSelect: (customer: CustomerListItem) => void; onClose: () => void
  onClear?: () => void; disabled?: boolean; activeOnly?: boolean; returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const actor = useAuthStore(state => state.user), searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ search: '', page: 0, size: 5 })
  const normalized = search.trim().replace(/\s+/g, ' '), searching = normalized !== query.search
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(current => current.search === normalized ? current : { ...current, search: normalized, page: 0 }), 300)
    return () => window.clearTimeout(timer)
  }, [normalized])
  const customers = useQuery({
    queryKey: ['customers', 'selector', actor?.id, query.search, query.page, query.size],
    queryFn: ({ signal }) => customerApi.list({ search: query.search || undefined, page: query.page, size: query.size }, signal),
    enabled: open && !searching,
  })
  const busy = searching || customers.isFetching
  return <Modal open={open} size="wide" title="Izaberi klijenta" className="client-selector-modal"
    initialFocusRef={searchRef} returnFocusRef={returnFocusRef} onClose={onClose} footer={customers.data && !customers.isError && <Pagination
      label="Stranice klijenata" numbered={false} page={query.page} pageSize={query.size} pageSizes={pageSizes}
      totalPages={customers.data.totalPages} totalElements={customers.data.totalElements} loading={busy} disabled={disabled}
      onPageChange={page => setQuery(current => ({ ...current, page }))}
      onPageSizeChange={size => setQuery(current => ({ ...current, size, page: 0 }))} />}>
    <label className="client-selector-search">Pretraga klijenata
      <Input ref={searchRef} type="search" maxLength={120} disabled={disabled} value={search}
        placeholder="Pretraži po imenu, prezimenu ili email adresi..." onChange={event => setSearch(event.target.value)} />
    </label>
    {onClear && <Button type="button" variant="secondary" disabled={disabled} onClick={() => { onClear(); onClose() }}>Svi klijenti</Button>}
    {searching || customers.isLoading ? <Skeleton lines={5} label="Učitavanje klijenata" /> : customers.isError
      ? <ErrorState message="Klijente nije moguće učitati. Pokušajte ponovo." action={<Button type="button" variant="secondary" disabled={disabled} onClick={() => void customers.refetch()}>Pokušaj ponovo</Button>} />
      : !customers.data?.content.length ? <EmptyState title={query.search ? 'Nema klijenata za ovu pretragu' : 'Nema klijenata'}
        description={query.search ? 'Promenite pretragu da biste pronašli klijenta.' : 'Nema dostupnih klijenata u ovom pregledu.'} />
        : <>
          {customers.isFetching && <p role="status">Učitavanje klijenata…</p>}
          <TableShell label="Klijenti" className="client-selector-table-wrap" aria-busy={busy || undefined}>
            <table className="ui-data-table client-selector-table">
              <thead><tr><th scope="col">Ime</th><th scope="col">Prezime</th><th scope="col">Email</th><th scope="col">Akcija</th></tr></thead>
              <tbody>{customers.data.content.map(customer => {
                // The existing model stores a single full name; keep the original value when selecting.
                const [firstName, ...surname] = customer.name.trim().split(/\s+/)
                return <tr key={customer.id} className={selectedId === customer.id ? 'is-selected' : undefined}>
                  <td><strong>{firstName || '—'}</strong>{selectedId === customer.id && <small>Trenutni izbor</small>}
                    {!customer.active && <small>{activeOnly ? 'Deaktiviran · izbor nije dostupan' : 'Deaktiviran'}</small>}</td>
                  <td>{surname.join(' ') || '—'}</td><td data-label="Email">{customer.email}</td>
                  <td><Button type="button" variant="secondary" disabled={disabled || busy || activeOnly && !customer.active}
                    aria-label={`Izaberi klijenta ${customer.name}`} onClick={() => { onSelect(customer); onClose() }}>Izaberi</Button></td>
                </tr>
              })}</tbody>
            </table>
          </TableShell>
        </>}
  </Modal>
}
