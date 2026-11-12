import { useState } from 'react'
import { ClientSelector } from '../customers/ClientSelector'
import type { CustomerChoice } from '../types/customer.types'
import { Button, Modal } from '../components/ui'
import { gamingTimeApi } from '../api/gamingTimeApi'
import { useGamingPurchase } from './useGamingPurchase'
import { PurchaseFields } from './PurchaseFields'
import { useFinancialCommand } from './useFinancialCommand'
export function RecordTimeDialog({ onClose }: { onClose: () => void }) {
  const [customer, setCustomer] = useState<CustomerChoice | null>(null), purchase = useGamingPurchase(customer?.id), command = useFinancialCommand(onClose)
  return <Modal open title="Plaćanje" onClose={onClose} closeDisabled={command.locked}><form className="ui-form-grid" onSubmit={e => { e.preventDefault(); if (customer && purchase.valid) { const id = customer.id, body = purchase.grant; void command.run(key => gamingTimeApi.grant(id, body, key)) } }}>
    {command.feedback}<ClientSelector selected={customer} onSelect={setCustomer} disabled={command.locked} /><PurchaseFields model={purchase} disabled={command.locked} /><Button type="submit" disabled={command.locked || !purchase.valid} loading={command.busy}>Potvrdi uplatu</Button>
  </form></Modal>
}
