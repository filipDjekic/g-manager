import { useQuery } from '@tanstack/react-query'
import { catalogApi } from '../api/catalogApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, Modal } from '../components/ui'
import { ResourceIcon } from './ResourceIcon'
import { resourceStatusLabels, resourceStatusTones, resourceTypeLabels, type MapResource } from './floorPlanGeometry'
import type { ResourceMenuAction } from './ResourceMenu'

export function ResourceDetails({resource,actions,onClose,metadataError}:{resource:MapResource;actions:ResourceMenuAction[];onClose:()=>void;metadataError:boolean}) {
  const actor=useAuthStore(state=>state.user)
  const services=useQuery({queryKey:['resources','service-options'],queryFn:()=>catalogApi.list({page:0,size:100,type:'SERVICE',active:true,sort:'name',direction:'ASC'}),enabled:hasCapability(actor,'CATALOG_READ')})
  const service=services.data?.content.find(value=>value.id===resource.serviceId)
  return <Modal open title={resource.name} className="resource-details-dialog" onClose={onClose}>
    <div className="resource-details-identity"><span className="resource-details-icon"><ResourceIcon type={resource.type}/></span><div><strong>{resourceTypeLabels[resource.type]}</strong><small>{resource.code} · {resource.areaName}</small></div><Badge tone={resourceStatusTones[resource.status]}>{resourceStatusLabels[resource.status]}</Badge></div>
    <p className="resource-interval-note">Dostupnost za {new Date(resource.start).toLocaleString('sr-RS',{timeZone:'Europe/Belgrade',dateStyle:'short',timeStyle:'short'})} – {new Date(resource.end).toLocaleTimeString('sr-RS',{timeZone:'Europe/Belgrade',hour:'2-digit',minute:'2-digit'})}. Konačna dostupnost se ponovo proverava pri potvrdi termina.</p>
    <dl className="resource-details-grid"><div><dt>Zona</dt><dd>{resource.areaName}</dd></div><div><dt>Tip</dt><dd>{resourceTypeLabels[resource.type]}</dd></div>
      {service&&<div><dt>Povezana usluga</dt><dd>{service.name}</dd></div>}
      {resource.details&&<><div><dt>Zakazivanje</dt><dd>{resource.details.bookable?'Dozvoljeno':'Nije dozvoljeno'}</dd></div><div><dt>Kapacitet</dt><dd>{resource.details.capacity}</dd></div><div><dt>Aktivnost</dt><dd>{resource.details.active?'Aktivan':'Neaktivan'}</dd></div></>}
    </dl>
    {resource.details?.description&&<p className="resource-details-description">{resource.details.description}</p>}
    {metadataError&&<p className="resource-interval-note" role="status">Dodatna podešavanja resursa trenutno nisu dostupna.</p>}
    <div className="resource-details-actions">{actions.filter(action=>action.label!=='Detalji').map((action,index)=><Button key={action.label} variant={index===0?'primary':'secondary'} disabled={action.disabled} onClick={action.onClick}>{action.label}</Button>)}</div>
  </Modal>
}
