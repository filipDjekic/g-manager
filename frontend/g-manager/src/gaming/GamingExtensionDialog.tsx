import { useState } from 'react'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { Button, Input, Modal } from '../components/ui'
import type { GamingStationCard } from '../types/gamingSession.types'
import { PurchaseFields } from './PurchaseFields'
import { useGamingPurchase } from './useGamingPurchase'
import { useFinancialCommand } from './useFinancialCommand'
export function GamingExtensionDialog({ station, initialMinutes, onClose }: { station: GamingStationCard; initialMinutes: number; onClose: () => void }) {
  const [minutes, setMinutes] = useState(initialMinutes), purchase = useGamingPurchase(station.resourceId, minutes, station.customerId)
  const command = useFinancialCommand(onClose)
  return <Modal open title={`Produzenje i naplata - ${station.resourceName}`} closeDisabled={command.locked} onClose={onClose}>
    <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); if (purchase.valid && station.sessionId && station.sessionVersion !== undefined) { const body = purchase.purchase!; void command.run(key => gamingSessionApi.extend(station.sessionId!, minutes, station.sessionVersion!, key, body)) } }}>
      {command.feedback}<label>Dodatni minuti<Input required type="number" min={1} max={1440} value={minutes} disabled={command.locked} onChange={e => setMinutes(Number(e.target.value))} /></label>
      <PurchaseFields model={purchase} disabled={command.locked} /><Button type="submit" disabled={command.locked || !purchase.valid} loading={command.busy}>Potvrdi naplatu i produzi</Button>
    </form>
  </Modal>
}
