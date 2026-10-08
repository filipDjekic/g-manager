import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { customerApi } from '../api/customerApi'
import { Button, ErrorState } from '../components/ui'
export function CustomerPicker({value,onChange,required=false,disabled=false}:{value:string;onChange:(id:string,name?:string)=>void;required?:boolean;disabled?:boolean}) {
  const [search,setSearch]=useState('')
  const customers=useQuery({queryKey:['customers','reservation-picker',search],queryFn:()=>customerApi.list({search:search||undefined,active:required?true:undefined,page:0,size:50})})
  return <div className="reservation-customer-picker"><label>Pretraga klijenta<input disabled={disabled} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ime ili e-mail"/></label>
    <label>Klijent<select required={required} disabled={disabled||customers.isLoading||!!customers.error} value={value} onChange={e=>onChange(e.target.value,customers.data?.content.find(c=>c.id===e.target.value)?.name)}>
      <option value="">{required?'Izaberite klijenta':'Svi klijenti'}</option>
      {value&&!customers.data?.content.some(c=>c.id===value)&&<option value={value}>Izabrani klijent</option>}
      {customers.data?.content.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {customers.isLoading&&<small role="status">Učitavanje klijenata…</small>}
    {customers.error&&<ErrorState message="Klijente nije moguće učitati." action={<Button type="button" onClick={()=>customers.refetch()}>Pokušaj ponovo</Button>}/>}
  </div>
}
