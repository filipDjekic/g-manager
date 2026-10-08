import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { resourceApi } from '../api/resourceApi'
import { userApi } from '../api/userApi'
import { apiErrorMessage } from '../api/client'
import { Badge, Button, EmptyState, ErrorState, Modal, Skeleton } from '../components/ui'

export function ResourceEmployees({resourceId,resourceName,onClose}:{resourceId:string;resourceName:string;onClose:()=>void}) {
  const client=useQueryClient(),inFlight=useRef(false)
  const [busy,setBusy]=useState(''),[error,setError]=useState('')
  const employees=useQuery({queryKey:['users','resource-employees'],queryFn:userApi.employees})
  const access=useQuery({queryKey:['resources','resource-employee-access',resourceId],queryFn:()=>resourceApi.resourceEmployees(resourceId)})
  const visibleEmployees=[...(employees.data??[]).map(employee=>({id:employee.id,name:employee.name,email:employee.email,active:true})),
    ...(access.data??[]).filter(assignment=>!employees.data?.some(employee=>employee.id===assignment.employeeId))
      .map(assignment=>({id:assignment.employeeId,name:assignment.employeeName,email:'',active:assignment.employeeActive}))]
  async function toggle(employeeId:string) {
    if(inFlight.current||!access.data)return
    const current=access.data.find(value=>value.employeeId===employeeId)
    inFlight.current=true;setBusy(employeeId);setError('')
    try {
      await resourceApi.setResourceEmployee(resourceId,employeeId,!current?.active,current?.version)
      await Promise.all([access.refetch(),client.invalidateQueries({queryKey:['gaming-operations']}),client.invalidateQueries({queryKey:['reservations']}),client.invalidateQueries({queryKey:['resource-management-scope']})])
    } catch(cause){setError(apiErrorMessage(cause,'Dodelu stanice nije moguće sačuvati.'));await access.refetch()}
    finally{inFlight.current=false;setBusy('')}
  }
  return <Modal open title={`Zaposleni · ${resourceName}`} onClose={()=>{if(!busy)onClose()}}>
    <p className="search-help">Zaposleni upravlja rezervacijama i sesijama ove stanice dok je dodela aktivna. Promena odmah važi za naredne operacije.</p>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {employees.isLoading||access.isLoading?<Skeleton lines={4}/>:employees.error||access.error?<ErrorState message="Zaposlene i dodele nije moguće učitati." action={<Button onClick={()=>{void employees.refetch();void access.refetch()}}>Pokušaj ponovo</Button>}/>:!visibleEmployees.length?<EmptyState title="Nema aktivnih zaposlenih" description="Prvo kreirajte zaposlenog u odeljku Zaposleni."/>:<ul className="operations-attention-list">{visibleEmployees.map(employee=>{
      const assigned=!!access.data?.find(value=>value.employeeId===employee.id)?.active
      return <li key={employee.id}><div><strong>{employee.name}{!employee.active&&' · neaktivan'}</strong>{employee.email&&<small>{employee.email}</small>}</div><Badge tone={assigned?'success':'neutral'}>{assigned?'Dodeljena stanica':'Nema pristup'}</Badge><Button variant="secondary" loading={busy===employee.id} disabled={!!busy||!employee.active&&!assigned} onClick={()=>void toggle(employee.id)}>{assigned?'Ukloni pristup':'Dodeli stanicu'}</Button></li>
    })}</ul>}
  </Modal>
}
