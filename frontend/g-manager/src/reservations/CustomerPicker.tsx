import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { customerApi } from '../api/customerApi'
import { Badge, Button, EmptyState, ErrorState, Modal, Pagination, Skeleton, TableShell } from '../components/ui'
import './reservations.css'

export function CustomerPicker({ value, onChange, required = false, disabled = false }: {
  value: string; onChange: (id: string, name?: string) => void; required?: boolean; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(''), [debounced, setDebounced] = useState(''), [page, setPage] = useState(0)
  const [chosen, setChosen] = useState<{id: string; name: string} | null>(null)
  const searchRef = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const normalized = search.trim().replace(/\s+/g, ' ')
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(normalized); setPage(0) }, 300)
    return () => window.clearTimeout(timer)
  }, [normalized])
  const selected = useQuery({queryKey: ['customers', 'reservation-selected', value], queryFn: () => customerApi.detail(value),
    enabled: !!value, refetchInterval: 15000})
  const customers = useQuery({queryKey: ['customers', 'reservation-picker', debounced, page],
    queryFn: () => customerApi.list({search: debounced || undefined, page, size: 10}), enabled: open})
  useEffect(() => {
    if (customers.data && !customers.isFetching && page >= Math.max(1, customers.data.totalPages))
      setPage(Math.max(0, customers.data.totalPages - 1))
  }, [customers.data, customers.isFetching, page])
  const searching = normalized !== debounced
  const name = chosen?.id === value ? chosen.name : selected.data?.customer.name
  const choose = (id: string, label?: string) => {
    setChosen(id ? {id, name: label ?? 'Izabrani klijent'} : null); onChange(id, label); setOpen(false)
  }
  return <div className="reservation-customer-picker reservation-customer-picker--dialog">
    <span>Klijent{required ? ' *' : ''}</span>
    <Button ref={trigger} type="button" variant="secondary" disabled={disabled} aria-haspopup="dialog"
      aria-label={value ? `Promeni klijenta: ${name ?? 'Izabrani klijent'}` : 'Izaberi klijenta'} onClick={() => setOpen(true)}>
      {value ? name ?? 'Učitavanje izabranog klijenta…' : required ? 'Izaberi klijenta' : 'Svi klijenti · izaberi klijenta'}
    </Button>
    {required && value && selected.data && !selected.data.customer.active && <p className="warning-banner" role="alert">Klijent je deaktiviran. Izaberite aktivnog klijenta za rezervaciju.</p>}
    {value && selected.error && <ErrorState message="Izabranog klijenta nije moguće proveriti." action={<Button type="button" onClick={() => selected.refetch()}>Pokušaj ponovo</Button>} />}
    <Modal open={open} title="Izbor klijenta" className="reservation-customer-dialog" initialFocusRef={searchRef}
      returnFocusRef={trigger} onClose={() => setOpen(false)} footer={<>
        {customers.data && !customers.error && <div className="reservation-customer-pagination"><small>
          Prikazano {customers.data.totalElements ? page * 10 + 1 : 0}–{Math.min((page + 1) * 10, customers.data.totalElements)} od {customers.data.totalElements} klijenata
        </small><Pagination page={page} totalPages={customers.data.totalPages} loading={customers.isFetching || searching} onPageChange={setPage} /></div>}
      </>}>
      <label className="reservation-customer-search">Pretraži po imenu, prezimenu ili mejlu
        <input ref={searchRef} type="search" value={search} maxLength={120} placeholder="Ime, prezime ili email" onChange={event => setSearch(event.target.value)} />
      </label>
      {!required && <Button type="button" variant="secondary" onClick={() => choose('')}>Svi klijenti</Button>}
      {searching && <p role="status">Pretraga klijenata…</p>}
      {customers.error ? <ErrorState message="Klijente nije moguće učitati." action={<Button type="button" onClick={() => customers.refetch()}>Pokušaj ponovo</Button>} />
        : customers.isLoading ? <Skeleton lines={5} /> : !customers.data?.content.length ? <EmptyState title="Nema klijenata" description="Promenite pretragu." />
          : <TableShell label="Klijenti"><table className="reservation-customer-table" role="table">
            <thead role="rowgroup"><tr role="row"><th scope="col">Ime i prezime</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Akcija</th></tr></thead>
            <tbody role="rowgroup">{customers.data.content.map(customer => <tr role="row" key={customer.id} className={value === customer.id ? 'reservation-customer-selected' : ''}>
              <td role="cell"><strong>{customer.name}</strong>{value === customer.id && <small>Trenutni izbor</small>}</td>
              <td role="cell">{customer.email}</td><td role="cell"><Badge tone={customer.active ? 'success' : 'neutral'}>{customer.active ? 'Aktivan' : 'Deaktiviran'}</Badge>
                {required && !customer.active && <small>Rezervisanje nije dostupno</small>}</td>
              <td role="cell"><Button type="button" variant="secondary" disabled={disabled || searching || customers.isFetching || required && !customer.active}
                aria-label={`Izaberi klijenta ${customer.name}`} onClick={() => choose(customer.id,customer.name)}>Izaberi</Button></td>
            </tr>)}</tbody>
          </table></TableShell>}
    </Modal>
  </div>
}
