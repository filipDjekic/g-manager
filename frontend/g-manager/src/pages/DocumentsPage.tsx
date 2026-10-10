import { useCallback, useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { documentApi } from '../api/documentApi'
import { useAuthStore } from '../auth/authStore'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { AppDocument, ScanStatus } from '../types/document.types'

const accept = '.png,.jpg,.jpeg,.pdf,.txt'
const scanLabels: Record<ScanStatus, string> = { PENDING: 'Provera u toku', CLEAN: 'Provera uspešna', REJECTED: 'Dokument odbijen', ERROR: 'Provera nije uspela' }
export function DocumentsPage() {
  const user = useAuthStore((state) => state.user), toast = useToast()
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [items, setItems] = useState<AppDocument[]>([]), [loading, setLoading] = useState(true)
  const [error, setError] = useState(''), [progress, setProgress] = useState<number | null>(null)
  const [retry, setRetry] = useState<{file: File; document?: AppDocument} | null>(null)
  const abort = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    if (!user) return
    try { setItems(await documentApi.list('GENERAL', user.id)); setError('') }
    catch (cause) { setError(apiErrorMessage(cause, 'Dokumenti nisu dostupni.')) }
    finally { setLoading(false) }
  }, [user])
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0)
    return () => { window.clearTimeout(timer); abort.current?.abort() }
  }, [refresh])

  async function upload(file?: File, existing?: AppDocument) {
    if (!file || !user || abort.current) return
    const controller = new AbortController(); abort.current = controller
    setProgress(0); setRetry(null); setError('')
    try {
      if (existing) await documentApi.version(existing, file, setProgress, controller.signal)
      else await documentApi.upload('GENERAL', user.id, file, setProgress, controller.signal)
      await refresh(); toast('Dokument je otpremljen. Sledi bezbednosna provera.', 'success')
    } catch (cause) {
      if (!controller.signal.aborted) { setRetry({file, document: existing}); setError(apiErrorMessage(cause, 'Otpremanje nije uspelo.')) }
    } finally { if (abort.current === controller) abort.current = null; setProgress(null) }
  }
  async function download(document: AppDocument, preview = false) {
    const version = document.versions[0]; if (!version) return
    try {
      const url = await documentApi.content(document.id, version.id, preview), anchor = window.document.createElement('a')
      anchor.href = url; if (!preview) anchor.download = version.filename; else anchor.target = '_blank'
      anchor.rel = 'noopener'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { setError(apiErrorMessage(cause, 'Dokument još nije dostupan.')) }
  }
  return <main className="workspace">{confirmationDialog}
    <PageHeader eyebrow="Privatno skladište" title="Dokumenti" actions={<Button variant="secondary" onClick={() => void refresh()}>Osveži</Button>} />
    <Card><label className="document-drop">Izaberite dokument
      <input type="file" disabled={progress !== null} accept={accept} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} />
      <span>PNG, JPEG, PDF ili TXT · do 5 MB</span></label>
      {progress !== null && <div role="status"><progress max="100" value={progress} aria-label="Otpremanje dokumenta" /><span>{progress}%</span>
        <Button variant="secondary" onClick={() => abort.current?.abort()}>Otkaži</Button></div>}
      {retry && <Button disabled={progress !== null} onClick={() => void upload(retry.file, retry.document)}>Ponovi otpremanje</Button>}
    </Card>
    {error && <ErrorState message={error} action={<Button variant="secondary" onClick={() => void refresh()}>Osveži</Button>} />}
    {loading ? <Skeleton lines={4} label="Učitavanje dokumenata" /> : !items.length ?
      <EmptyState title="Nema dokumenata" description="Otpremite prvi privatni dokument." /> :
      <div className="document-list">{items.map((document) => {
        const latest = document.versions[0]
        return <Card key={document.id}><h2>{document.displayName}</h2>
          <p>Verzija {latest?.number ?? '—'} · {latest ? (latest.sizeBytes / 1024).toFixed(1) : '—'} KB</p>
          {latest && <Badge tone={latest.scanStatus === 'CLEAN' ? 'success' : latest.scanStatus === 'PENDING' ? 'info' : 'danger'}>{scanLabels[latest.scanStatus]}</Badge>}
          <details><summary>Istorija verzija</summary><ul>{document.versions.map((version) =>
            <li key={version.id}>v{version.number} · {version.filename} · {scanLabels[version.scanStatus]}<small className="table-secondary">{formatBusinessDateTime(version.createdAt)}</small></li>)}</ul></details>
          <div className="document-actions"><Button disabled={latest?.scanStatus !== 'CLEAN'} onClick={() => void download(document, true)}>Pregled</Button>
            <Button variant="secondary" disabled={latest?.scanStatus !== 'CLEAN'} onClick={() => void download(document)}>Preuzmi</Button>
            <label className="ui-button ui-button--secondary">Nova verzija<input className="sr-only" type="file" disabled={progress !== null} accept={accept}
              onChange={(event) => { void upload(event.target.files?.[0], document); event.target.value = '' }} /></label>
            <Button variant="danger" disabled={progress !== null} onClick={() => confirm({ title: 'Obriši dokument',
              description: `Dokument “${document.displayName}” biće uklonjen.`, variant: 'danger', confirmLabel: 'Obriši dokument', errorMessage: 'Brisanje nije uspelo.',
              onConfirm: async () => { await documentApi.remove(document); setItems((current) => current.filter((item) => item.id !== document.id)); toast('Dokument je obrisan.', 'success') } })}>Obriši</Button>
          </div>
        </Card>
      })}</div>}
  </main>
}
