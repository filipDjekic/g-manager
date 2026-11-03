import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gamingBillingApi, type PaymentMethod } from '../api/gamingBillingApi'
import { gamingSessionApi } from '../api/gamingSessionApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Alert, Button, Input, Modal, Select } from '../components/ui'
import type { GamingStationCard } from '../types/gamingSession.types'
import { useFinancialCommand } from './useFinancialCommand'

export function StationFinanceActions({ station }: { station: GamingStationCard }) {
  const [mode, setMode] = useState<'account' | 'prepare' | 'move' | null>(null)
  return <><div className="ui-actions">
    {(station.sessionId || station.latestSessionId) && <Button variant="secondary" onClick={() => setMode('account')}>Naplata i finansijska istorija</Button>}
    {station.sessionId && <Button variant="secondary" onClick={() => setMode('move')}>{station.moveTargetId ? 'Dovrsi premestanje' : 'Premesti sesiju'}</Button>}
    {!station.sessionId && station.privacyReady === false && <Button variant="warning" onClick={() => setMode('prepare')}>Priprema privatnosti</Button>}
  </div>{mode && <StationFinanceDialog station={station} mode={mode} onClose={() => setMode(null)} />}</>
}
function StationFinanceDialog({ station, mode, onClose }: { station: GamingStationCard; mode: 'account' | 'prepare' | 'move'; onClose: () => void }) {
  const actor = useAuthStore(s => s.user), command = useFinancialCommand(onClose)
  const id = station.sessionId ?? station.latestSessionId ?? ''
  const [amount, setAmount] = useState(''), [reference, setReference] = useState(''), [reason, setReason] = useState(''), [verified, setVerified] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('CASH'), [original, setOriginal] = useState(''), [target, setTarget] = useState('')
  const account = useQuery({ queryKey: ['gaming-billing', 'account', id], queryFn: () => gamingBillingApi.account(id), enabled: mode === 'account' && !!id })
  const prep = useQuery({ queryKey: ['gaming-billing', 'preparation', station.resourceId], queryFn: () => gamingBillingApi.preparation(station.resourceId), enabled: mode === 'prepare' })
  const board = useQuery({ queryKey: ['gaming-operations', 'board'], queryFn: () => gamingSessionApi.board(), enabled: mode === 'move' })
  return <Modal open title={mode === 'prepare' ? 'Bezbedna priprema racunara' : mode === 'move' ? 'Premestanje sesije' : 'Naplata i interna potvrda'} closeDisabled={command.locked} onClose={onClose}>
    {command.feedback}{(account.error || prep.error || board.error) && <Alert tone="danger">Podaci nisu dostupni. Zatvorite i ponovo otvorite pregled.</Alert>}
    {mode === 'prepare' && <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); if (prep.data?.session_id && verified) void command.run(key => gamingBillingApi.prepare(station.resourceId, { sessionId: prep.data!.session_id, isolatedProfileVerified: verified, reason }, key)) }}>
      <Alert tone="warning">Zakljucavanje i Windows odjava ne uklanjaju sacuvane tokene. Pre potvrde proverite izolaciju ili obnovu player Windows profila i nedostupnost prethodnih browser/launcher, Discord, Steam, Epic i Riot naloga, preuzimanja i privremenih podataka. Sacuvajte igre i game saves; po potrebi koristite administratora i maintenance.</Alert>
      <label><Input type="checkbox" required disabled={command.locked} checked={verified} onChange={e => setVerified(e.target.checked)} /> Proverena je izolacija podataka prethodnog korisnika i priprema Windows profila.</label>
      <label>Opis izvrsene provere<Input required maxLength={500} disabled={command.locked} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <Button type="submit" disabled={command.locked || !verified || !prep.data?.session_id}>Potvrdi proverenu pripremu</Button>
    </form>}
    {mode === 'move' && <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); if (station.moveTargetId) void command.run(key => gamingSessionApi.completeMove(id, station.sessionVersion!, key)); else if (target) void command.run(key => gamingSessionApi.move(id, target, station.sessionVersion!, key)) }}>
      <p>Preostalo vreme se cuva. Prvo se zakljucava izvorni racunar; nastavak na odredistu dozvoljen je tek posle potvrde Client-a. Odrediste mora biti iste kategorije i lokacije.</p>
      {station.moveTargetId && <Alert tone="warning">Premestanje ceka potvrdu izvornog Client-a. Odrediste: {board.data?.stations.find(s => s.resourceId === station.moveTargetId)?.resourceName ?? station.moveTargetId}</Alert>}<label>Odredisna stanica<Select required={!station.moveTargetId} value={target} disabled={command.locked} onChange={e => setTarget(e.target.value)}><option value="">Izaberite stanicu</option>{board.data?.stations.filter(s => s.locationId === station.locationId && s.resourceId !== station.resourceId && s.allowedActions.includes('START')).map(s => <option key={s.resourceId} value={s.resourceId}>{s.resourceName}</option>)}</Select></label>
      {station.moveTargetId && target && <Button type="button" disabled={command.locked} onClick={() => void command.run(key => gamingSessionApi.move(id, target, station.sessionVersion!, key))}>Potvrdi drugo odrediste</Button>}
      <Button disabled={command.locked || !station.moveTargetId && !target} type="submit">{station.moveTargetId ? 'Potvrdi nastavak na odredistu' : 'Potvrdi zakljucavanje i premestanje'}</Button>
    </form>}
    {mode === 'account' && account.data && <>
      <p><strong>Neplaceno: {account.data.due} RSD</strong></p><p>Interna evidencija - nije fiskalni racun. POS transakcije su evidentirane potvrde spoljnog terminala.</p>
      <ul>{account.data.charges.map(c => <li key={c.id}>{c.minutes} min / {c.amount} RSD <details><summary>Pravila kupovine</summary><PriceSnapshot snapshot={c.snapshot} /></details></li>)}</ul>
      <ul>{account.data.transactions.map(t => <li key={t.id}>{t.kind} - {t.amount} {t.currency} - {t.method} - {t.status} {t.reason} {t.reference && `POS referenca: ${t.reference}`} <small>Potvrda {t.id} - {t.created_at}</small></li>)}</ul>
      <form className="ui-form-grid" onSubmit={e => { e.preventDefault(); void command.run(key => original ? gamingBillingApi.refund(id, original, amount, reason, key) : gamingBillingApi.pay(id, { method, amount, reference }, key)) }}>
        {hasCapability(actor, 'GAMING_FINANCE_MANAGE') && <label>Operacija<Select value={original} disabled={command.locked} onChange={e => setOriginal(e.target.value)}><option value="">Nova uplata duga</option>{account.data.transactions.filter(t => t.kind === 'PAYMENT').map(t => <option key={t.id} value={t.id}>Refundacija {t.amount} RSD ({t.method})</option>)}</Select></label>}
        <label>Iznos RSD<Input type="number" required min="0.01" step="0.01" value={amount} disabled={command.locked} onChange={e => setAmount(e.target.value)} /></label>
        {!original && <><label>Nacin placanja<Select value={method} disabled={command.locked} onChange={e => setMethod(e.target.value as PaymentMethod)}><option value="CASH">Gotovina</option><option value="EXTERNAL_POS">Spoljni POS</option>{station.customerId && <option value="WALLET">Prepaid</option>}</Select></label>{method === 'EXTERNAL_POS' && <label>POS referenca<Input required value={reference} onChange={e => setReference(e.target.value)} /></label>}</>}
        <label>Razlog<Input required={!!original} maxLength={500} value={reason} disabled={command.locked} onChange={e => setReason(e.target.value)} /></label>
        <Button type="submit" disabled={command.locked}>{original ? 'Potvrdi evidentiranu refundaciju' : 'Potvrdi primljenu uplatu'}</Button>
      </form>
    </>}
  </Modal>
}

type StoredPrice = { tariff?: { name: string }; quote?: { gross: string | number; discount: string | number; total: string | number }; reason?: string }
function readPrice(snapshot: string): StoredPrice | null {
  try { return JSON.parse(snapshot) as StoredPrice } catch { return null }
}
function PriceSnapshot({ snapshot }: { snapshot: string }) {
  const s = readPrice(snapshot)
  if (!s) return <p>Snimak obracuna nije dostupan.</p>
  return <dl><dt>Tarifa pri kupovini</dt><dd>{s.tariff?.name}</dd><dt>Pre popusta</dt><dd>{s.quote?.gross} RSD</dd><dt>Popust</dt><dd>{s.quote?.discount} RSD</dd><dt>Obracunato</dt><dd>{s.quote?.total} RSD</dd>{s.reason && <><dt>Razlog</dt><dd>{s.reason}</dd></>}</dl>
}
