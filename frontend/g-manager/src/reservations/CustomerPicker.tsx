import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { customerApi } from '../api/customerApi'
import { Alert, Button, ErrorState } from '../components/ui'
import { ClientSelector } from '../customers/ClientSelector'
import type { CustomerChoice } from '../types/customer.types'
import './reservations.css'

export function CustomerPicker({ value, onChange, required = false, disabled = false }: {
  value: string; onChange: (id: string, name?: string) => void; required?: boolean; disabled?: boolean
}) {
  const [chosen, setChosen] = useState<CustomerChoice | null>(null)
  const selected = useQuery({queryKey: ['customers', 'reservation-selected', value], queryFn: () => customerApi.detail(value),
    enabled: !!value, refetchInterval: 15000})
  const customer = value ? selected.data?.customer ?? (chosen?.id === value ? chosen : { id: value, name: 'Izabrani klijent' }) : null
  return <div className="reservation-customer-picker reservation-customer-picker--dialog">
    <ClientSelector selected={customer} required={required} activeOnly={required} disabled={disabled}
      onSelect={customer => { setChosen(customer); onChange(customer.id, customer.name) }}
      onClear={required ? undefined : () => { setChosen(null); onChange('') }} />
    {required && value && selected.data && !selected.data.customer.active && <Alert tone="warning" role="alert">Klijent je deaktiviran. Izaberite aktivnog klijenta za rezervaciju.</Alert>}
    {value && selected.error && <ErrorState message="Izabranog klijenta nije moguće proveriti." action={<Button variant="secondary" type="button" onClick={() => selected.refetch()}>Pokušaj ponovo</Button>} />}
  </div>
}
