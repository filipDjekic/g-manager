import { GamingWalletPanel } from './GamingWalletPanel'
import { GamingPaymentHistory } from './GamingPaymentHistory'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gamingBillingApi } from '../api/gamingBillingApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Alert, Button, Input, Modal } from '../components/ui'
import type { GamingStationCard } from '../types/gamingSession.types'
import { useFinancialCommand } from './useFinancialCommand'

export function StationFinanceActions({ station }: { station: GamingStationCard }) {
  const [mode, setMode] = useState<'account' | 'prepare' | null>(null)
  const canPay = hasCapability(useAuthStore(s => s.user), 'GAMING_PAYMENT_RECORD')
  return <><div className="ui-actions">
    {canPay && (station.sessionId || station.latestSessionId) && <Button variant="secondary" onClick={() => setMode('account')}>{station.billingMode === 'TIME_BALANCE' ? 'Plaćanje' : 'Finansijska istorija'}</Button>}
    {station.customerId && <GamingPaymentHistory customerId={station.customerId} />}
    {!station.sessionId && station.privacyReady === false && <Button variant="warning" onClick={() => setMode('prepare')}>Priprema privatnosti</Button>}
  </div>{mode && <StationFinanceDialog station={station} mode={mode} onClose={() => setMode(null)} />}</>
}
function StationFinanceDialog({ station, mode, onClose }: { station: GamingStationCard; mode: 'account' | 'prepare'; onClose: () => void }) {
  const command = useFinancialCommand(onClose)
  const id = station.sessionId ?? station.latestSessionId ?? ''
  const [reason, setReason] = useState(''), [verified, setVerified] = useState(false)
  const knownTimeAccount = station.billingMode === 'TIME_BALANCE' && !!station.customerId
  const account = useQuery({ queryKey: ['gaming-billing', 'account', id], queryFn: () => gamingBillingApi.account(id), enabled: mode === 'account' && !!id && !knownTimeAccount })
  const prep = useQuery({ queryKey: ['gaming-billing', 'preparation', station.resourceId], queryFn: () => gamingBillingApi.preparation(station.resourceId), enabled: mode === 'prepare' })
  const accountTime = knownTimeAccount || account.data?.billingMode === 'TIME_BALANCE'
  const customerId = station.customerId ?? account.data?.customerId
  return <Modal open title={mode === 'prepare' ? 'Bezbedna priprema računara' : accountTime ? 'Plaćanje' : 'Finansijska istorija'} closeDisabled={command.locked} onClose={onClose}>
    {command.feedback}{(account.error || prep.error) && <Alert tone="danger">Podaci nisu dostupni. Zatvorite i ponovo otvorite pregled.</Alert>}
    {mode === 'prepare' && <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); if (prep.data?.session_id && verified) void command.run(key => gamingBillingApi.prepare(station.resourceId, { sessionId: prep.data!.session_id, isolatedProfileVerified: verified, reason }, key)) }}>
      <Alert tone="warning">Pre potvrde proverite izolaciju Windows profila i nedostupnost naloga prethodnog korisnika u browseru, launcherima i drugim aplikacijama.</Alert>
      <label><Input type="checkbox" required disabled={command.locked} checked={verified} onChange={e => setVerified(e.target.checked)} /> Proverena je izolacija podataka prethodnog korisnika i priprema Windows profila.</label>
      <label>Opis izvrsene provere<Input required maxLength={500} disabled={command.locked} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <Button type="submit" disabled={command.locked || !verified || !prep.data?.session_id}>Potvrdi proverenu pripremu</Button>
    </form>}
    {mode === 'account' && accountTime && customerId && <GamingWalletPanel customerId={customerId} />}
    {mode === 'account' && !accountTime && account.data && <ul>{account.data.transactions.map(t => <li key={t.id}>{t.created_at} · {t.amount} {t.currency}{t.reason ? ` · ${t.reason}` : ''}</li>)}</ul>}
  </Modal>
}
