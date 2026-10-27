import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { resourceApi } from '../api/resourceApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, EmptyState, ErrorState, Modal, Select, Skeleton } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import type { UserResponse } from '../types/user.types'
import { EmployeeIcon } from './employeePresentation'
import { employeeError } from './employeePresentation.model'

export function EmployeeLocationDialog({ employee, actorId, onClose }: { employee: UserResponse; actorId: string; onClose: () => void }) {
  const client = useQueryClient(), toast = useToast(), id = useId()
  const [locationId, setLocationId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const inFlight = useRef(false), mounted = useRef(false), select = useRef<HTMLSelectElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const locations = useQuery({ queryKey: ['resources', 'employee-location-options', actorId], queryFn: resourceApi.locations })
  const access = useQuery({ queryKey: ['resources', 'employee-access', locationId],
    queryFn: () => resourceApi.employeeAccess(locationId), enabled: Boolean(locationId), staleTime: 0, retry: false })
  const location = locations.data?.find(value => value.id === locationId && value.active)
  const current = access.data?.find(value => value.employeeId === employee.id)
  async function assign() {
    const actor = useAuthStore.getState().user
    if (inFlight.current || !employee.active || !location || !access.isSuccess || access.isFetching || actor?.id !== actorId || !hasCapability(actor, 'RESOURCE_MANAGE')) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      await resourceApi.setEmployeeAccess(location.id, employee.id, true, current?.version)
      if (!mounted.current || useAuthStore.getState().user?.id !== actorId) return
      toast(`Lokacija „${location.name}“ je dodeljena zaposlenom.`, 'success')
      void Promise.all([
        client.invalidateQueries({ queryKey: ['users', 'employee-assignments', actorId, employee.id] }),
        client.invalidateQueries({ queryKey: ['resources'] }), client.invalidateQueries({ queryKey: ['resource-management-scope'] }),
        client.invalidateQueries({ queryKey: ['gaming-operations'] }), client.invalidateQueries({ queryKey: ['reservations'] }),
      ])
      onClose()
    } catch (cause) {
      if (mounted.current) { setError(employeeError(cause, 'Dodelu lokacije nije moguće sačuvati. Proverite osvežene podatke pre ponovnog pokušaja.')); await access.refetch() }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }
  return <Modal open title="Dodeli lokaciju" titleIcon={<EmployeeIcon kind="location" />} className="gm-employee-dialog"
    initialFocusRef={select} closeDisabled={busy} onClose={() => { if (!inFlight.current) onClose() }}
    footer={<div className="dialog-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Kasnije</Button>
      <Button type="button" className="gm-employee-primary" loading={busy} disabled={!location || !access.isSuccess || access.isFetching || !employee.active} onClick={() => void assign()}>Potvrdi dodelu</Button></div>}>
    <p className="gm-employee-note">Dodelite pristup zaposlenom <strong>{employee.name}</strong>.</p>
    {locations.isLoading ? <Skeleton lines={3} /> : locations.isError ? <ErrorState message={employeeError(locations.error, 'Lokacije nije moguće učitati.')}
      action={<Button type="button" onClick={() => void locations.refetch()}>Pokušaj ponovo</Button>} /> : !locations.data?.some(value => value.active)
        ? <EmptyState title="Nema aktivnih lokacija" description="Lokacije možete urediti na Mapi resursa." />
        : <label className="gm-employee-location-select" htmlFor={`${id}-location`}>Lokacija<Select aria-label={"Lokacija"} ref={select} id={`${id}-location`} value={locationId} disabled={busy}
          onChange={event => { setLocationId(event.target.value); setError('') }}><option value="">Izaberite lokaciju</option>
          {locations.data.filter(value => value.active).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</Select></label>}
    {locationId && (access.isLoading ? <Skeleton lines={1} /> : access.isError ? <ErrorState message={employeeError(access.error, 'Postojeću dodelu nije moguće učitati.')}
      action={<Button type="button" variant="secondary" onClick={() => void access.refetch()}>Pokušaj ponovo</Button>} />
      : current?.active && <p className="gm-employee-note"><Badge tone="info">Lokacija je već dodeljena</Badge> Nova potvrda ponovo primenjuje pristup postojećim stanicama.</p>)}
    <p className="gm-employee-assignment-notice">Potvrda dodeljuje pristup svim postojećim stanicama lokacije kroz postojeći sistem dodela. Naknadno dodate stanice zahtevaju novu dodelu.</p>
    {error && <p className="error-banner" role="alert">{error}</p>}
  </Modal>
}
