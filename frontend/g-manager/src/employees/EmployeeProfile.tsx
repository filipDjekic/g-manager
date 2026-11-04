import { usePagedQuery } from '../query/usePagedQuery'
import { Pagination } from '../components/ui/Pagination'
import { useServerNow } from '../gaming/useServerNow'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { userApi } from '../api/userApi'
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { roleLabels } from '../components/ui/statusPresentation'
import type { UserResponse } from '../types/user.types'
import { EmployeeAvatar, EmployeeIcon } from './employeePresentation'
import { employeeDate, employeeError } from './employeePresentation.model'

export function EmployeeProfile({ employee, actorId, canAssignments, canAssignLocation, canLeave, canSettings, canResourceRead, canDeactivate, canDelete, busy,
  onClose, onDeactivate, onDelete, onAssign, onRefresh }: {
  employee: UserResponse; actorId: string; canAssignments: boolean; canAssignLocation: boolean
  canLeave: boolean; canSettings: boolean; canResourceRead: boolean
  canDeactivate: boolean; canDelete: boolean; busy: boolean; onClose: () => void; onDeactivate: () => void
  onDelete: () => void; onAssign: () => void; onRefresh: () => void
}) {
  const now = useServerNow()
  const assignments = useQuery({ queryKey: ['users', 'employee-assignments', actorId, employee.id],
    queryFn: () => userApi.employeeAssignments(employee.id), enabled: canAssignments, staleTime: 15000, retry: false })
  const leaves = usePagedQuery(['users', 'employee-leaves', actorId, employee.id], (page, size) => userApi.employeeLeaves(employee.id, page, size), 10, canLeave)
  return <div className="gm-employee-profile">
    <header className="gm-employee-profile-heading"><span>Profil zaposlenog</span><Button iconOnly type="button" variant="secondary" className="gm-employee-inline-close"
      disabled={busy} aria-label="Zatvori profil zaposlenog" onClick={onClose}>×</Button></header>
    <div className="gm-employee-profile-identity"><EmployeeAvatar employee={employee} large /><h2>{employee.name}</h2>
      <div><Badge tone="info">{roleLabels[employee.role]}</Badge><Badge tone={employee.active ? 'success' : 'neutral'}>{employee.active ? 'Aktivan nalog' : 'Neaktivan nalog'}</Badge></div>
      <p className="gm-employee-note">Status naloga nije evidencija prisustva ili smene.</p></div>
    <section><h3>Osnovne informacije</h3><dl className="gm-employee-information">
      <div><dt>Ime i prezime</dt><dd>{employee.name}</dd></div><div><dt>Email</dt><dd><a href={`mailto:${employee.email}`}>{employee.email}</a></dd></div>
      <div><dt>Uloga</dt><dd>{roleLabels[employee.role]}</dd></div><div><dt>Status naloga</dt><dd>{employee.active ? 'Aktivan' : 'Neaktivan'}</dd></div>
      <div><dt>Datum kreiranja</dt><dd><time dateTime={employee.createdAt}>{employeeDate(employee.createdAt)}</time></dd></div>
      <div><dt>Poslednja izmena</dt><dd><time dateTime={employee.updatedAt}>{employeeDate(employee.updatedAt)}</time></dd></div>
    </dl></section>
    {canAssignments && <section><h3><EmployeeIcon kind="location" />Dodele pristupa</h3>
      {assignments.isLoading ? <Skeleton lines={4} /> : assignments.isError ? <ErrorState message={employeeError(assignments.error, 'Dodele nije moguće učitati.')}
        action={<Button type="button" variant="secondary" onClick={() => void assignments.refetch()}>Pokušaj ponovo</Button>} /> : assignments.data && <>
        <h4>Dodeljene lokacije</h4>{!assignments.data.locations.length ? <p className="gm-employee-note">Nema dodeljenih lokacija.</p>
          : <ul className="gm-employee-assignment-list">{assignments.data.locations.map(location => <li key={location.id}>
            <div><strong>{location.name}</strong><small>{location.code}</small></div><Badge tone={location.active ? 'info' : 'neutral'}>{location.active ? 'Dodeljena' : 'Lokacija neaktivna'}</Badge>
            {canResourceRead && <Link to={`/resources?${new URLSearchParams({ locationId: location.id })}`}>Pogledaj lokaciju</Link>}</li>)}</ul>}
        <h4>Dodeljeni resursi</h4>{!assignments.data.resources.length ? <p className="gm-employee-note">Nema dodeljenih resursa.</p>
          : <ul className="gm-employee-assignment-list">{assignments.data.resources.map(resource => <li key={resource.id}>
            <div><strong>{resource.name}</strong><small>{resource.code} · {resource.locationName} · {resource.areaName}</small></div>
            {!resource.active && <Badge tone="neutral">Resurs ili prostor neaktivan</Badge>}
            {canResourceRead && <Link to={`/resources?${new URLSearchParams({ locationId: resource.locationId, areaId: resource.areaId, resourceId: resource.id })}`}>Pogledaj resurs</Link>}</li>)}</ul>}
        <p className="gm-employee-note">Pristup konkretnoj stanici određuju pojedinačne dodele resursa. Dodela ne označava radnu smenu.</p>
      </>}
    </section>}
    {canLeave && <section><h3><EmployeeIcon kind="leave" />Odobrena odsustva</h3>
      {leaves.isLoading ? <Skeleton lines={3} /> : leaves.isError ? <ErrorState message={employeeError(leaves.error, 'Odsustva nije moguće učitati.')}
        action={<Button type="button" variant="secondary" onClick={() => void leaves.refetch()}>Pokušaj ponovo</Button>} /> : !leaves.data?.content.length
          ? <EmptyState title="Nema odobrenih odsustava" description="Nema odsustava koja obuhvataju danas ili buduće datume." />
          : <ul className="gm-employee-leave-list">{leaves.data.content.map(leave => <li key={leave.id}><Badge tone={new Date(leave.startsAt).getTime() > now ? 'info' : 'success'}>
            {new Date(leave.startsAt).getTime() > now ? 'Buduće · odobreno' : 'Odobreno'}</Badge>
            <div><time dateTime={leave.startsAt}>{employeeDate(leave.startsAt)}</time><span> - </span><time dateTime={leave.endsAt}>{employeeDate(leave.endsAt)}</time></div></li>)}</ul>}
      {leaves.data && <Pagination page={leaves.page} onPageChange={leaves.setPage} totalPages={leaves.data.totalPages} totalElements={leaves.data.totalElements} pageSize={10} loading={leaves.isFetching} />}
      <p className="gm-employee-note">Prikazani su datumi odobrenih odsustava, bez privatnih razloga.</p>
    </section>}
    <div className="gm-employee-profile-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => { onRefresh(); if (canAssignments) void assignments.refetch(); if (canLeave) void leaves.refetch() }}><EmployeeIcon kind="refresh" />Osveži profil</Button>
      {canAssignLocation && employee.active && <Button type="button" variant="secondary" disabled={busy} onClick={onAssign}><EmployeeIcon kind="location" />Dodeli lokaciju</Button>}
      {canResourceRead && <Link className="ui-button ui-button--primary ui-button--medium" to="/resources"><EmployeeIcon kind="resource" />Pogledaj mapu resursa</Link>}
      {canSettings && <Link className="ui-button ui-button--primary ui-button--medium" to="/settings"><EmployeeIcon kind="calendar" />Radno vreme i odsustva</Link>}
      {canDeactivate && <Button type="button" variant="danger" disabled={busy} onClick={onDeactivate}><EmployeeIcon kind="lock" />Deaktiviraj nalog</Button>}
      {canDelete && <Button type="button" variant="danger" disabled={busy} onClick={onDelete}><EmployeeIcon kind="delete" />Obriši nalog</Button>}
    </div>
  </div>
}
