import { gamingTimeApi } from '../api/gamingTimeApi'
import { Button, Modal } from '../components/ui'
import type { GamingStationCard } from '../types/gamingSession.types'
import { PurchaseFields } from './PurchaseFields'
import { useGamingPurchase } from './useGamingPurchase'
import { useFinancialCommand } from './useFinancialCommand'
export function GamingExtensionDialog({ station, initialMinutes, onClose }: { station: GamingStationCard; initialMinutes: number; onClose: () => void }) {
  const purchase = useGamingPurchase(station.customerId, initialMinutes), command = useFinancialCommand(onClose)
  return <Modal open title={`Dodaj vreme — ${station.customerDisplayName ?? station.resourceName}`} closeDisabled={command.locked} onClose={onClose}>
    <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); if (purchase.valid && station.customerId) { const id = station.customerId, body = purchase.grant; void command.run(key => gamingTimeApi.grant(id, body, key)) } }}>
      {command.feedback}<PurchaseFields model={purchase} disabled={command.locked} /><Button type="submit" disabled={command.locked || !purchase.valid} loading={command.busy}>Potvrdi uplatu</Button>
    </form>
  </Modal>
}
