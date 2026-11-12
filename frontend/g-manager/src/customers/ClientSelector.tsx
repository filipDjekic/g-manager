import { useRef, useState, type RefObject } from 'react'
import { Button } from '../components/ui'
import type { CustomerChoice } from '../types/customer.types'
import { ClientSelectorModal } from './ClientSelectorModal'

export function ClientSelector({ selected, onSelect, disabled = false, onCreate, onClear, activeOnly = true, required = false, triggerRef }: {
  selected?: CustomerChoice | null; onSelect: (customer: CustomerChoice) => void; disabled?: boolean
  onCreate?: () => void; onClear?: () => void; activeOnly?: boolean; required?: boolean; triggerRef?: RefObject<HTMLButtonElement | null>
}) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null)
  const returnFocusRef = triggerRef ?? trigger
  return <div className="client-selector">
    <span>Klijent{required ? ' *' : ''}</span>
    <div className="client-selector-selection">
      <Button ref={returnFocusRef} type="button" variant="secondary" disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
        aria-label={selected ? `Promeni klijenta: ${selected.name}` : 'Izaberi klijenta'} onClick={() => setOpen(true)}>
        {selected ? 'Promeni klijenta' : 'Izaberi klijenta'}
      </Button>
      {selected ? <div className="client-selector-chosen"><strong>{selected.name}</strong>{selected.email && <small>{selected.email}</small>}</div>
        : onClear && <span>Svi klijenti</span>}
      {onCreate && <Button type="button" variant="secondary" disabled={disabled} onClick={onCreate}>+ Novi klijent</Button>}
    </div>
    <ClientSelectorModal open={open} selectedId={selected?.id} disabled={disabled} activeOnly={activeOnly} returnFocusRef={returnFocusRef}
      onSelect={onSelect} onClear={onClear} onClose={() => setOpen(false)} />
  </div>
}
