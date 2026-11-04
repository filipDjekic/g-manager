import { usePagedQuery } from '../query/usePagedQuery'
import type { PageResponse } from '../types/api.types'
import { Pagination, Skeleton } from '../components/ui'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stationApi } from '../api/stationApi'
import { apiClient } from '../api/client'
import { Alert, Button } from '../components/ui'
import { formatBusinessDateTime } from '../reservations/dateTime'
import { isNewerClientVersion } from './stationPresentation.model'

interface Update { id: string; targetVersion: string; status: string; requestedAt: string; notBefore: string; updatedAt: string; reason: string }
const labels: Record<string, string> = { REQUESTED: 'Zahtev primljen', INSTALLING: 'Instalacija u toku', DEFERRED: 'Odloženo do kraja sesije', DOWNLOADING: 'Preuzimanje', APPLIED: 'Instalirano', FAILED: 'Neuspešno', EXPIRED: 'Zahtev istekao', SUPERSEDED: 'Zamenjeno novim zahtevom' }
export function StationClientUpdates({ stationId, installedVersion }: { stationId: string; installedVersion?: string }) {
  const queryClient = useQueryClient(), [reason, setReason] = useState(''), [delay, setDelay] = useState('0')
  const key = ['stations', stationId, 'client-updates']
  const history = usePagedQuery(key, (page, size) => apiClient.get<PageResponse<Update>>(`/stations/${stationId}/client-updates`, { params: { page, size } }).then(r => r.data), 10, true, 30000)
  const release = useQuery({ queryKey: ['stations', 'client-package'], queryFn: stationApi.clientPackage })
  const request = useMutation({ mutationFn: () => apiClient.post(`/stations/${stationId}/client-updates`, { reason: reason.trim(), notBefore: new Date(Date.now() + Number(delay) * 60000).toISOString() }),
    onSuccess: () => { setReason(''); history.setPage(0); void queryClient.invalidateQueries({ queryKey: key }) } })
  const available = !release.isError && release.data?.status === 'RELEASED' ? release.data.version : undefined
  return <section aria-label="Centralizovana ažuriranja klijenta" className="ui-secondary-section">
    <h3>Ažuriranje Client-a</h3>
    <p>Instalirano: {installedVersion || 'Nije prijavljeno'} · Dostupno: {available || 'Nije potvrđeno'}</p>
    <p>Računar proverava potpisani zahtev najkasnije pri sledećoj proveri ažuriranja. Aktivna sesija odlaže instalaciju. Održavanje i oporavak na računaru zahtevaju lokalnog administratora.</p>
    <form onSubmit={event => { event.preventDefault(); request.mutate() }}>
      <label>Početak ažuriranja <select value={delay} onChange={event => setDelay(event.target.value)}><option value="0">Kada stanica bude slobodna</option><option value="15">Za najmanje 15 minuta</option><option value="60">Za najmanje jedan sat</option><option value="240">Za najmanje četiri sata</option></select></label>
      <label>Razlog <input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <Button type="submit" loading={request.isPending} disabled={!isNewerClientVersion(available, installedVersion) || !reason.trim() || history.isError}>Zatraži ažuriranje ove stanice</Button>
    </form>
    {request.isError && <Alert tone="danger">Zahtev nije potvrđen. Osvežite status pre ponovnog pokušaja.</Alert>}
    {request.isSuccess && <Alert tone="success">Zahtev je evidentiran. Proverite ishod u istoriji.</Alert>}
    {history.isLoading ? <Skeleton lines={3} /> : history.isError ? <Alert tone="danger"><Button onClick={() => void history.refetch()}>Osvezi</Button><span>Istorija ažuriranja trenutno nije potvrđena.</span></Alert> : history.data?.content.length ? <ul>{history.data.content.map(update => <li key={update.id}>
      <strong>{update.targetVersion} · {labels[update.status] || update.status}</strong> · {formatBusinessDateTime(update.updatedAt)}<br />{update.reason}
    </li>)}</ul> : <p>Nema zabeleženih zahteva za ažuriranje.</p>}
    {history.data && <Pagination page={history.page} onPageChange={history.setPage} totalPages={history.data.totalPages} totalElements={history.data.totalElements} pageSize={10} loading={history.isFetching} />}
  </section>
}
