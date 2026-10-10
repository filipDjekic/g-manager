import { useQuery } from '@tanstack/react-query'
import { useId, useState, type RefObject } from 'react'
import { catalogApi } from '../api/catalogApi'
import { resourceApi } from '../api/resourceApi'
import { apiErrorMessage } from '../api/client'
import { Badge, Button, Drawer, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { ResourceIcon } from '../resources/ResourceIcon'
import { resourceTypeLabels } from '../resources/floorPlanGeometry'
import type { CatalogItem } from '../types/catalog.types'
import { CatalogImage } from './CatalogImage'
import { CatalogOrderLink, type CatalogAction, type CatalogPermissions } from './CatalogCard'
import { CatalogIcon, catalogDate, catalogDuration, catalogMoney, catalogTypeLabel } from './CatalogPresentation'

function resourceRestriction(reason?: string | null) {
  if (reason === 'Service is inactive') return 'Usluga je neaktivna.'
  if (reason === 'Station is unavailable for booking') return 'Stanica trenutno nije dostupna za rezervisanje.'
  if (reason === 'Resource or location is inactive or not bookable') return 'Resurs, zona ili lokal su neaktivni ili resurs nije moguće rezervisati.'
  return reason ? 'Resurs trenutno nije moguće rezervisati.' : ''
}

export function CatalogDetails({ item: snapshot, permissions, canReadResources, busy, returnFocusRef, onClose, onAction }: {
  item: CatalogItem; permissions: CatalogPermissions; canReadResources: boolean; busy: boolean
  returnFocusRef: RefObject<HTMLButtonElement | null>; onClose: () => void
  onAction: (item: CatalogItem, action: CatalogAction, trigger: HTMLButtonElement) => void
}) {
  const [tab, setTab] = useState<'BASIC' | 'RESOURCES'>('BASIC')
  const id = useId()
  const detail = useQuery({ queryKey: ['catalog', 'detail', snapshot.id], queryFn: () => catalogApi.get(snapshot.id),
    enabled: !snapshot.deletedAt, initialData: snapshot, staleTime: 0 })
  const item = snapshot.deletedAt ? snapshot : detail.data ?? snapshot
  const withResources = item.type === 'SERVICE' && canReadResources && !item.deletedAt
  const resources = useQuery({ queryKey: ['catalog', 'resources', item.id], queryFn: () => resourceApi.catalogResources(item.id),
    enabled: withResources && tab === 'RESOURCES', staleTime: 15000 })
  const activeTab = withResources ? tab : 'BASIC'
  return <Drawer open title={item.type === 'SERVICE' ? 'Detalji usluge' : 'Detalji proizvoda'}
    className="gm-catalog-details-drawer" size="wide" closeDisabled={busy} returnFocusRef={returnFocusRef} onClose={onClose}>
    <div className="gm-catalog-details">
      <div className="gm-catalog-details-scroll">
        <CatalogImage key={item.imageUrl} item={item} eager />
        <div className="gm-catalog-details-identity"><span className="gm-catalog-type-label"><CatalogIcon type={item.type} />{catalogTypeLabel(item.type)}</span>
          <Badge tone={item.deletedAt ? 'danger' : item.active ? 'success' : 'neutral'}>{item.deletedAt ? 'Obrisano' : item.active ? 'Aktivno' : 'Neaktivno'}</Badge>
          <h3>{item.name}</h3><strong className="gm-catalog-details-price">{catalogMoney.format(item.price)}</strong></div>
        {detail.error && !item.deletedAt && <ErrorState title="Detalji nisu osveženi" message={apiErrorMessage(detail.error, 'Prikazani su poslednji učitani podaci.')}
          action={<Button type="button" variant="secondary" onClick={() => void detail.refetch()}>Pokušaj ponovo</Button>} />}
        <div className="gm-catalog-details-tabs" role="tablist" aria-label="Detalji stavke">
          <button type="button" role="tab" id={`${id}-basic-tab`} aria-selected={activeTab === 'BASIC'} aria-controls={`${id}-panel`}
            tabIndex={activeTab === 'BASIC' ? 0 : -1} onClick={() => setTab('BASIC')}
            onKeyDown={event => { if (withResources && ['ArrowLeft', 'ArrowRight', 'End'].includes(event.key)) {
              event.preventDefault(); setTab('RESOURCES'); document.getElementById(`${id}-resources-tab`)?.focus()
            } }}>Osnovne informacije</button>
          {withResources && <button type="button" role="tab" id={`${id}-resources-tab`} aria-selected={activeTab === 'RESOURCES'} aria-controls={`${id}-panel`}
            tabIndex={activeTab === 'RESOURCES' ? 0 : -1} onClick={() => setTab('RESOURCES')}
            onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) {
              event.preventDefault(); setTab('BASIC'); document.getElementById(`${id}-basic-tab`)?.focus()
            } }}>Resursi</button>}
        </div>
        <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${activeTab === 'BASIC' ? 'basic' : 'resources'}-tab`}>
          {activeTab === 'BASIC' ? <>
            <p className="gm-catalog-details-description">{item.description || 'Opis nije dodat.'}</p>
            <dl className="gm-catalog-details-fields">
              <div><dt>Tip</dt><dd>{catalogTypeLabel(item.type)}</dd></div>
              <div><dt>Status</dt><dd>{item.deletedAt ? 'Obrisano' : item.active ? 'Aktivno' : 'Neaktivno'}</dd></div>
              {item.type === 'SERVICE' && <>
                <div><dt>Trajanje</dt><dd>{item.durationMinutes !== null ? catalogDuration(item.durationMinutes) : 'Nije navedeno'}</dd></div>
                <div><dt>Zahteva fizički resurs</dt><dd>{item.requiresResource ? 'Da' : 'Ne'}</dd></div>
              </>}
              <div><dt>Cena</dt><dd>{catalogMoney.format(item.price)}</dd></div>
              <div><dt>Kreirano</dt><dd>{catalogDate(item.createdAt)}</dd></div>
              <div><dt>Poslednja izmena</dt><dd>{catalogDate(item.updatedAt)}</dd></div>
              {item.deletedAt && <><div><dt>Obrisano</dt><dd>{catalogDate(item.deletedAt)}</dd></div>
                <div className="gm-catalog-wide"><dt>Razlog brisanja</dt><dd>{item.deletionReason || 'Nije naveden'}</dd></div></>}
            </dl>
          </> : <div className="gm-catalog-resources">
            <p className="gm-catalog-resource-note">Povezani resursi i uslovi za rezervisanje. Slobodan termin proverava se pri rezervaciji.</p>
            {resources.isLoading && <Skeleton lines={4} label="Učitavanje povezanih resursa" />}
            {resources.error && <ErrorState message={apiErrorMessage(resources.error, 'Resurse nije moguće učitati.')}
              action={<Button type="button" variant="secondary" onClick={() => void resources.refetch()}>Pokušaj ponovo</Button>} />}
            {resources.data?.length === 0 && <EmptyState title="Nema povezanih resursa" description="Ovoj usluzi još nije pridružen fizički resurs." />}
            {resources.data?.map(resource => <article className="gm-catalog-resource" key={resource.id}>
              <div className="gm-catalog-resource-heading"><ResourceIcon type={resource.type} /><div><h4>{resource.name}</h4><span>{resource.code} · {resourceTypeLabels[resource.type]}</span></div></div>
              <dl><div><dt>Lokal</dt><dd>{resource.locationName}</dd></div>{resource.areaName && <div><dt>Zona</dt><dd>{resource.areaName}</dd></div>}</dl>
              <Badge tone={resource.available ? 'success' : 'warning'}>{resource.available ? 'Može da se rezerviše' : 'Nije za rezervisanje'}</Badge>
              {resource.unavailabilityReason && <p>{resourceRestriction(resource.unavailabilityReason)}</p>}
            </article>)}
          </div>}
        </section>
      </div>
      <div className="gm-catalog-details-actions">
        {item.deletedAt ? permissions.restore && <Button type="button" disabled={busy} onClick={event => onAction(item, 'RESTORE', event.currentTarget)}>Vrati stavku</Button> : <>
          {permissions.order && item.active && <CatalogOrderLink item={item} />}
          {permissions.manage && <>
            <Button type="button" disabled={busy} onClick={event => onAction(item, 'EDIT', event.currentTarget)}>Izmeni</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={event => onAction(item, 'IMAGE', event.currentTarget)}>Promeni sliku</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={event => onAction(item, item.active ? 'DEACTIVATE' : 'ACTIVATE', event.currentTarget)}>{item.active ? 'Deaktiviraj' : 'Aktiviraj'}</Button>
          </>}
          {permissions.remove && <Button type="button" variant="danger" disabled={busy} onClick={event => onAction(item, 'DELETE', event.currentTarget)}>Obriši</Button>}
        </>}
      </div>
    </div>
  </Drawer>
}
