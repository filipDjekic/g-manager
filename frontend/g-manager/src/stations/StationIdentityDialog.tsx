import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { stationApi } from '../api/stationApi'
import { Button, EmptyState, ErrorState, Modal, Skeleton } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { useToast } from '../components/ui/toastContext'
import { formatBusinessDateTime } from '../reservations/dateTime'
import type { EnrollmentToken, StationOverview } from '../types/station.types'
import { connectionStatus, StationIcon, stationError } from './stationPresentation'

export function StationIdentityDialog({ station, onClose }: { station: StationOverview; onClose: () => void }) {
  const client = useQueryClient(), toast = useToast(), inFlight = useRef(false)
  const { confirm, confirmationDialog } = useConfirmDialog()
  // The one-time token lives only in this mounted dialog, never in the query/mutation cache or URL.
  const [enrollment, setEnrollment] = useState<Pick<EnrollmentToken, 'enrollmentToken' | 'expiresAt' | 'purpose'> | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const identities = useQuery({ queryKey: ['stations', 'machine-identities', station.resourceId], queryFn: () => stationApi.machineIdentities(station.resourceId) })
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ['stations'] }), client.invalidateQueries({ queryKey: ['gaming-operations'] })])
  async function issue(rotation: boolean) {
    if (inFlight.current || !identities.data || identities.isError) return
    inFlight.current = true; setBusy(true); setError(''); setEnrollment(null)
    try {
      const result = rotation ? await stationApi.createRotationToken(station.resourceId) : await stationApi.createEnrollmentToken(station.resourceId)
      setEnrollment({ enrollmentToken: result.enrollmentToken, expiresAt: result.expiresAt, purpose: result.purpose })
      await identities.refetch(); toast(rotation ? 'Kod za rotaciju je kreiran.' : 'Kod za upis je kreiran.', 'success')
    } catch (cause) { setError(stationError(cause, 'Kod nije moguće preuzeti. Proverite stanje identiteta pre novog pokušaja.')); await identities.refetch() }
    finally { inFlight.current = false; setBusy(false) }
  }
  function revoke() {
    if (busy) return
    confirm({ title: 'Opozovi identitete stanice', description: `${station.resourceName}: svi aktivni identiteti i neiskorišćeni upisni kodovi biće opozvani. Za novi pristup potreban je ponovni upis Gaming Client-a.`,
      variant: 'danger', confirmLabel: 'Opozovi identitete', formatError: cause => stationError(cause, 'Identitete nije moguće opozvati.'),
      onConfirm: async () => {
        if (inFlight.current) throw new Error('Sačekajte završetak prethodne akcije.')
        inFlight.current = true; setBusy(true); setError('')
        try { await stationApi.revokeMachineIdentities(station.resourceId); setEnrollment(null); toast('Identiteti stanice su opozvani.', 'success') }
        finally { await refresh(); inFlight.current = false; setBusy(false) }
      } })
  }
  async function copyToken() {
    if (!enrollment) return
    try { await navigator.clipboard.writeText(enrollment.enrollmentToken); toast('Kod je kopiran.', 'success') }
    catch { toast('Kopiranje nije dostupno. Ručno kopirajte prikazani kod.', 'error') }
  }
  const hasActive = identities.data?.some(identity => identity.status === 'ACTIVE')
  const invalid = identities.isLoading || identities.isFetching || identities.isError || !identities.data
  return <Modal open className="gm-stations-dialog gm-stations-identity-dialog" title={`Identitet klijenta · ${station.resourceName}`}
    titleIcon={<StationIcon kind="shield" />} closeDisabled={busy} onClose={onClose}
    footer={<div className="dialog-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Zatvori</Button></div>}>
    {confirmationDialog}
    <div className="gm-stations-identity-content">
      <p className="gm-stations-form-note">{station.resourceCode} · {connectionStatus(station).label}{station.lastHeartbeatAt && ` · poslednji kontakt ${formatBusinessDateTime(station.lastHeartbeatAt, false, 'sr-Latn-RS')}`}</p>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {identities.isLoading ? <Skeleton lines={3} label="Učitavanje identiteta klijenta" /> : identities.isError
        ? <ErrorState message={stationError(identities.error, 'Identiteti klijenta nisu dostupni.')} action={<Button type="button" onClick={() => identities.refetch()}>Pokušaj ponovo</Button>} />
        : !identities.data?.length ? <EmptyState title="Klijent još nije upisan" description="Kreirajte jednokratni kod za povezivanje Gaming Client-a sa ovom stanicom." />
        : <div className="gm-stations-identities">{identities.data.map(identity => <article key={identity.id}><strong>Ključ v{identity.keyVersion} · {{ ACTIVE: 'Aktivan', ROTATING: 'Rotacija u toku', REVOKED: 'Opozvan' }[identity.status]}</strong>
          <dl><div><dt>Otisak javnog ključa</dt><dd><code>{identity.publicKeyFingerprint}</code></dd></div>
            <div><dt>Vreme upisa</dt><dd>{formatBusinessDateTime(identity.enrolledAt, false, 'sr-Latn-RS')}</dd></div>
            <div><dt>Poslednja autentifikacija</dt><dd>{identity.lastAuthenticatedAt ? formatBusinessDateTime(identity.lastAuthenticatedAt, false, 'sr-Latn-RS') : 'Nije zabeležena'}</dd></div>
            {identity.overlapExpiresAt && <div><dt>Preklapanje ključeva važi do</dt><dd>{formatBusinessDateTime(identity.overlapExpiresAt, false, 'sr-Latn-RS')}</dd></div>}
            {identity.revokedAt && <div><dt>Vreme opozivanja</dt><dd>{formatBusinessDateTime(identity.revokedAt, false, 'sr-Latn-RS')}</dd></div>}</dl>
        </article>)}</div>}
      {enrollment && <div className="gm-stations-enrollment" role="status"><strong>{enrollment.purpose === 'ROTATION' ? 'Kod za rotaciju' : 'Kod za upis'} · dostupan samo sada</strong>
        <code>{enrollment.enrollmentToken}</code><p>Važi do {formatBusinessDateTime(enrollment.expiresAt, false, 'sr-Latn-RS')}. Kopirajte ga pre zatvaranja ovog prozora.</p>
        <Button type="button" variant="secondary" onClick={() => void copyToken()}>Kopiraj kod</Button></div>}
      {!station.clientEnabled && <p className="gm-stations-form-note">Za upis ili rotaciju prvo uključite Gaming Client integraciju u podešavanjima stanice.</p>}
      <div className="gm-stations-identity-actions"><Button type="button" loading={busy} disabled={invalid || Boolean(hasActive) || !station.clientEnabled} onClick={() => void issue(false)}>Novi kod za upis</Button>
        <Button type="button" variant="secondary" disabled={busy || invalid || !hasActive || !station.clientEnabled} onClick={() => void issue(true)}>Rotiraj ključ</Button>
        <Button type="button" variant="danger" disabled={busy || invalid} onClick={revoke}>Opozovi identitete</Button></div>
    </div>
  </Modal>
}
