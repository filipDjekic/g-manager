import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { resourceApi } from '../api/resourceApi'
import { userApi } from '../api/userApi'
import { apiErrorMessage } from '../api/client'
import { Badge, Button, EmptyState, ErrorState, Modal, Skeleton } from '../components/ui'

export function LocationEmployees({locationId,locationName,onClose}:{locationId:string;locationName:string;onClose:()=>void}) {
  const client=useQueryClient(),inFlight=useRef(false)
  const [busy,setBusy]=useState(''),[error,setError]=useState('')
  const employees=useQuery({queryKey:['users','location-employees'],queryFn:userApi.employees})
  const access=useQuery({queryKey:['resources','employee-access',locationId],queryFn:()=>resourceApi.employeeAccess(locationId)})
  async function toggle(employeeId:string) {
    if(inFlight.current||!access.data)return
    const current=access.data.find(value=>value.employeeId===employeeId)
    inFlight.current=true;setBusy(employeeId);setError('')
    try {
      await resourceApi.setEmployeeAccess(locationId,employeeId,!current?.active,current?.version)
      await Promise.all([access.refetch(),client.invalidateQueries({queryKey:['gaming-operations']})])
    } catch(cause){setError(apiErrorMessage(cause,'Dodelu lokacije nije moguće sačuvati.'));await access.refetch()}
    finally{inFlight.current=false;setBusy('')}
  }
  return <Modal open title={`Zaposleni · ${locationName}`} onClose={()=>{if(!busy)onClose()}}>
    <p className="search-help">Dodela lokacije omogućava zaposlenom pregled i rad sa gaming stanicama ove lokacije.</p>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {employees.isLoading||access.isLoading?<Skeleton lines={4}/>:employees.error||access.error?<ErrorState message="Zaposlene i dodele nije moguće učitati." action={<Button onClick={()=>{void employees.refetch();void access.refetch()}}>Pokušaj ponovo</Button>}/>:!employees.data?.length?<EmptyState title="Nema aktivnih zaposlenih" description="Prvo kreirajte zaposlenog u odeljku Zaposleni."/>:<ul className="operations-attention-list">{employees.data.map(employee=>{
      const assigned=!!access.data?.find(value=>value.employeeId===employee.id)?.active
      return <li key={employee.id}><div><strong>{employee.name}</strong><small>{employee.email}</small></div><Badge tone={assigned?'success':'neutral'}>{assigned?'Dodeljena lokacija':'Nema pristup'}</Badge><Button variant="secondary" loading={busy===employee.id} disabled={!!busy} onClick={()=>void toggle(employee.id)}>{assigned?'Ukloni pristup':'Dodeli lokaciju'}</Button></li>
    })}</ul>}
  </Modal>
}
