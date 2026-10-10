import { useCallback, useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { documentApi } from '../api/documentApi'
import { workflowApi } from '../api/workflowApi'
import { hasCapability } from '../auth/capabilities'
import { useAuthStore } from '../auth/authStore'
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, PageHeader, Skeleton, TableShell } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { WorkflowDefinitionInput, WorkflowDetail, WorkflowSummary, WorkflowStatus } from '../types/workflow.types'
import type { StatusTone } from '../components/ui'

const pilot=(due=24):WorkflowDefinitionInput=>({key:'EXPENSE_APPROVAL',name:'Odobrenje internog troška',initialStep:'MANAGER_REVIEW',enabled:true,steps:[{key:'MANAGER_REVIEW',label:'Provera administratora',role:'ADMIN',dueHours:due,reminderHours:Math.max(1,Math.floor(due/2)),escalationRole:'OWNER'},{key:'OWNER_REVIEW',label:'Konačno odobrenje vlasnika',role:'OWNER',dueHours:due,reminderHours:Math.max(1,Math.floor(due/2)),escalationRole:'OWNER'},{key:'REQUESTER_REVISION',label:'Dopuna zahteva',role:'SUBMITTER',dueHours:48,reminderHours:24,escalationRole:'OWNER'}],transitions:[{from:'MANAGER_REVIEW',action:'APPROVE',target:'OWNER_REVIEW',reasonRequired:false},{from:'MANAGER_REVIEW',action:'REJECT',target:'REJECTED',reasonRequired:true},{from:'MANAGER_REVIEW',action:'RETURN',target:'REQUESTER_REVISION',reasonRequired:true},{from:'OWNER_REVIEW',action:'APPROVE',target:'APPROVED',reasonRequired:false},{from:'OWNER_REVIEW',action:'REJECT',target:'REJECTED',reasonRequired:true},{from:'OWNER_REVIEW',action:'RETURN',target:'REQUESTER_REVISION',reasonRequired:true},{from:'REQUESTER_REVISION',action:'SUBMIT',target:'MANAGER_REVIEW',reasonRequired:false},{from:'REQUESTER_REVISION',action:'CANCEL',target:'CANCELLED',reasonRequired:true}]});
const statusLabels: Record<WorkflowStatus, string> = { ACTIVE: 'U obradi', APPROVED: 'Odobreno', REJECTED: 'Odbijeno', RETURNED: 'Vraćeno na dopunu', CANCELLED: 'Otkazano' }
const statusTones: Record<WorkflowStatus, StatusTone> = { ACTIVE: 'info', APPROVED: 'success', REJECTED: 'danger', RETURNED: 'warning', CANCELLED: 'neutral' }
const actionLabels: Record<string, string> = { APPROVE: 'Odobri', REJECT: 'Odbij', RETURN: 'Vrati na dopunu', SUBMIT: 'Pošalji', CANCEL: 'Otkaži' }
const stepLabels: Record<string, string> = { MANAGER_REVIEW: 'Provera administratora', OWNER_REVIEW: 'Odluka vlasnika', REQUESTER_REVISION: 'Dopuna zahteva' }

export function WorkflowsPage() {
  const user = useAuthStore((state) => state.user)
  const canSubmit = hasCapability(user, 'WORKFLOW_SUBMIT'), canAct = hasCapability(user, 'WORKFLOW_ACT'), canManage = hasCapability(user, 'WORKFLOW_MANAGE')
  const [items, setItems] = useState<WorkflowSummary[]>([]), [detail, setDetail] = useState<WorkflowDetail | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [comment, setComment] = useState(''), [title, setTitle] = useState(''), [amount, setAmount] = useState(''), [description, setDescription] = useState('')
  const [due, setDue] = useState(24)
  const inFlight = useRef(false)
  const { confirm, confirmationDialog } = useConfirmDialog()
  const refresh = useCallback(async () => {
    try {
      const lists = await Promise.all([canAct ? workflowApi.inbox() : Promise.resolve([]), canSubmit ? workflowApi.mine() : Promise.resolve([])])
      setItems(Array.from(new Map(lists.flat().map((item) => [item.id, item])).values())); setError('')
    } catch (cause) { setError(apiErrorMessage(cause, 'Workflow podaci nisu dostupni.')) }
    finally { setLoading(false) }
  }, [canAct, canSubmit])
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer) }, [refresh])
  async function open(id: string) {
    try { setDetail(await workflowApi.detail(id)) }
    catch (cause) { setError(apiErrorMessage(cause, 'Workflow nije dostupan.')) }
  }
  async function run(action: () => Promise<unknown>, fallback: string) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true)
    try { await action(); setError('') }
    catch (cause) { setError(apiErrorMessage(cause, fallback)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  function decide(action: string) {
    if (!detail || !detail.workflow.allowedActions.includes(action)) return
    const current = detail
    confirm({ title: `${actionLabels[action] ?? action} zahtev`, description: 'Odluka će biti sačuvana u istoriji zahteva.',
      confirmLabel: actionLabels[action] ?? 'Potvrdi odluku', variant: ['REJECT', 'CANCEL'].includes(action) ? 'danger' : 'default',
      reasonLabel: 'Razlog', reasonRequired: ['REJECT', 'RETURN', 'CANCEL'].includes(action), errorMessage: 'Odluka nije sačuvana. Osvežite podatke.',
      onConfirm: async (reason) => { setDetail(await workflowApi.act(current.workflow, action, reason ?? '')); await refresh() } })
  }
  return <main className="workspace">{confirmationDialog}<PageHeader eyebrow="Odobravanje i evidencija" title="Workflow" actions={<Button variant="secondary" onClick={() => void refresh()}>Osveži</Button>} />
    {error && <ErrorState message={error} action={<Button variant="secondary" onClick={() => void refresh()}>Pokušaj ponovo</Button>} />}
    {canSubmit && <details className="panel"><summary>Novi zahtev za trošak</summary><form className="form-grid" onSubmit={(event) => { event.preventDefault(); void run(async () => {
      await workflowApi.create({ definitionKey: 'EXPENSE_APPROVAL', title, amount: Number(amount), description }); setTitle(''); setAmount(''); setDescription(''); await refresh()
    }, 'Zahtev nije kreiran.') }}>
      <label>Naziv<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Iznos (RSD)<input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>Opis<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <Button type="submit" loading={busy}>Pošalji na odobrenje</Button>
    </form></details>}
    {canManage && <details className="panel"><summary>Definicija procesa odobravanja</summary><p>Provera administratora, odluka vlasnika i dopuna podnosioca zahteva.</p>
      <label>Rok obrade (sati)<input type="number" min="2" max="720" value={due} onChange={(event) => setDue(Number(event.target.value))} /></label>
      <Button disabled={!Number.isInteger(due) || due < 2 || due > 720} onClick={() => confirm({ title: 'Objavi verziju procesa',
        description: `Novi zahtevi koristiće proces sa rokom obrade od ${due} sati.`, variant: 'warning', confirmLabel: 'Objavi verziju',
        onConfirm: async () => { await workflowApi.publish(pilot(due)); await refresh() } })}>Objavi novu verziju</Button>
    </details>}
    {loading ? <Skeleton lines={5} /> : !items.length ? <EmptyState title="Nema zahteva" description="Nema workflow zahteva koji su vam trenutno vidljivi." /> :
      <Card><h2>Za obradu i moji zahtevi</h2><TableShell label="Workflow zahtevi"><table className="responsive-table"><thead><tr><th>Naziv</th><th>Status</th><th>Korak</th><th>Rok</th><th>Akcije</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}><td data-label="Naziv"><strong>{item.title}</strong><small className="table-secondary">{item.amount.toLocaleString('sr-RS')} RSD</small></td>
          <td data-label="Status"><Badge tone={statusTones[item.status]}>{statusLabels[item.status]}</Badge>{item.escalated && <small className="table-secondary">Eskalirano</small>}</td>
          <td data-label="Korak">{item.currentStep ? stepLabels[item.currentStep] ?? item.currentStep : '—'}</td><td data-label="Rok">{item.dueAt ? formatBusinessDateTime(item.dueAt) : '—'}</td>
          <td data-label="Akcije"><Button variant="secondary" onClick={() => void open(item.id)}>Detalji</Button></td></tr>)}</tbody></table></TableShell></Card>}
    <Drawer size="wide" open={Boolean(detail)} title={detail?.workflow.title ?? 'Workflow'} onClose={() => setDetail(null)} closeDisabled={busy}>
      {detail && <div className="form-grid">{error && <p className="error-banner" role="alert">{error}</p>}<div className="section-heading"><Badge tone={statusTones[detail.workflow.status]}>{statusLabels[detail.workflow.status]}</Badge><strong>{detail.workflow.amount.toLocaleString('sr-RS')} RSD</strong></div>
        <p>{detail.description}</p><section><h3>Istorija zahteva</h3><ol className="timeline-list">
          {detail.steps.map((step) => <li key={step.id}><strong>{stepLabels[step.key] ?? step.key}</strong><span>{step.status}</span><time>Rok: {formatBusinessDateTime(step.dueAt)}</time></li>)}
          {detail.decisions.map((decision) => <li key={decision.id}><strong>{actionLabels[decision.action] ?? decision.action}</strong><time>{formatBusinessDateTime(decision.at)}</time>{decision.reason && <p>{decision.reason}</p>}</li>)}
          {detail.comments.map((item) => <li key={item.id}><strong>Komentar</strong><p>{item.body}</p></li>)}
        </ol></section>
        {detail.workflow.allowedActions.length > 0 && <div className="form-actions" aria-label="Dozvoljene akcije">{detail.workflow.allowedActions.map((action) =>
          <Button key={action} disabled={busy} variant={['REJECT','CANCEL'].includes(action) ? 'danger' : 'secondary'} onClick={() => decide(action)}>{actionLabels[action] ?? action}</Button>)}</div>}
        <form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (comment.trim()) void run(async () => {
          setDetail(await workflowApi.comment(detail.workflow.id, comment)); setComment('')
        }, 'Komentar nije dodat.') }}><label>Komentar<textarea required value={comment} onChange={(event) => setComment(event.target.value)} /></label><Button type="submit" variant="secondary" loading={busy}>Dodaj komentar</Button></form>
        <label>Prilog<input type="file" disabled={busy} accept=".png,.jpg,.jpeg,.pdf,.txt" onChange={(event) => {
          const file = event.target.files?.[0]; if (!file) return
          void run(async () => { const controller = new AbortController(); const document = await documentApi.upload('WORKFLOW_ATTACHMENT', detail.workflow.id, file, () => {}, controller.signal)
            setDetail(await workflowApi.link(detail.workflow.id, document.id)) }, 'Prilog nije dodat.')
        }} /></label>
      </div>}
    </Drawer>
  </main>
}
