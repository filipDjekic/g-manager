import { useState } from 'react'
import { gamingTimeApi } from '../api/gamingTimeApi'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Alert, Button, Skeleton } from '../components/ui'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useGamingPurchase } from './useGamingPurchase'
import { PurchaseFields } from './PurchaseFields'
import { useFinancialCommand } from './useFinancialCommand'
import { remaining } from './presentation'

export function GamingWalletPanel({ customerId }: { customerId: string }) {
  const actor = useAuthStore(s => s.user), manage = hasCapability(actor, 'GAMING_PAYMENT_RECORD')
  const purchase = useGamingPurchase(customerId), wallet = purchase.wallet, command = useFinancialCommand()
  const [finish, setFinish] = useState(false)
  const active = wallet.data?.activeSession
  return <div>
    {command.feedback}
    {manage ? <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); if (purchase.valid) { const body = purchase.grant; void command.run(key => gamingTimeApi.grant(customerId, body, key)) } }}>
      <PurchaseFields model={purchase} disabled={command.locked} /><Button loading={command.busy} disabled={command.locked || !purchase.valid} type="submit">Potvrdi uplatu</Button>
    </form> : <section className="ui-card"><h3>Vreme</h3>
      {wallet.isLoading && <Skeleton lines={1} />}{wallet.error && <Alert tone="danger">Raspoloživo vreme nije dostupno.</Alert>}
      {wallet.data && <p>Raspoloživo vreme: <strong>{remaining(wallet.data.balanceSeconds)}</strong></p>}
      {active && actor?.id === customerId && <Button disabled={command.locked} onClick={() => setFinish(true)}>Završi sesiju</Button>}
    </section>}
    <ConfirmDialog open={finish} title="Završi sesiju" description="Preostalo vreme ostaje na nalogu. Računar se zaključava." confirmLabel="Završi sesiju" onClose={() => setFinish(false)} onConfirm={async () => { if (active) { await gamingSessionApi.finish(active.id); await wallet.refetch(); setFinish(false) } }} />
  </div>
}
