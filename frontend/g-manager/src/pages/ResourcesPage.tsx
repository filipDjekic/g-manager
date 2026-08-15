import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { resourceApi } from '../api/resourceApi'
import { EmptyState, ErrorState, Skeleton } from '../components/ui'
import type { AreaView, LocationView, ResourceAvailability } from '../types/resource.types'

export function ResourcesPage() {
  const navigate = useNavigate()
  const [locations, setLocations] = useState<LocationView[]>([])
  const [areas, setAreas] = useState<AreaView[]>([])
  const [resources, setResources] = useState<ResourceAvailability[]>([])
  const [locationId, setLocationId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [start, setStart] = useState(() =>
    new Date(Date.now() + 3600000).toISOString().slice(0, 16))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadLocations = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const values = (await resourceApi.locations()).filter((value) => value.active)
      setLocations(values)
      setLocationId((current) => values.some((value) => value.id === current)
        ? current : values[0]?.id ?? '')
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Lokacije nisu dostupne.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void loadLocations())
  }, [loadLocations])

  useEffect(() => {
    queueMicrotask(() => {
      setAreas([])
      setAreaId('')
      setResources([])
      if (!locationId) return
      setLoading(true)
      setError('')
      void resourceApi.areas(locationId).then((values) => {
        const active = values.filter((value) => value.active)
        setAreas(active)
        setAreaId(active[0]?.id ?? '')
      }).catch((cause) => setError(apiErrorMessage(cause, 'Zone nisu dostupne.')))
        .finally(() => setLoading(false))
    })
  }, [locationId])

  useEffect(() => {
    queueMicrotask(() => {
      setResources([])
      if (!areaId || !start) return
      setLoading(true)
      setError('')
      const from = new Date(start).toISOString()
      const to = new Date(new Date(start).getTime() + 3600000).toISOString()
      void resourceApi.availability(areaId, from, to).then(setResources)
        .catch((cause) => setError(apiErrorMessage(cause, 'Mapa nije dostupna.')))
        .finally(() => setLoading(false))
    })
  }, [areaId, start])

  const area = areas.find((value) => value.id === areaId)
  return <main className="page">
    <header className="page-header"><div><p className="eyebrow">Prostor i kapacitet</p>
      <h1>Mapa resursa</h1><p>Izaberite lokaciju, zonu i vreme.</p></div></header>
    {error && <ErrorState message={error}
      action={<button type="button" onClick={() => void loadLocations()}>Pokušaj ponovo</button>} />}
    {loading && !locations.length ? <Skeleton lines={5} label="Učitavanje lokacija" />
      : !locations.length ? <EmptyState title="Nema dostupnih lokacija"
        description="Administrator prvo mora da aktivira lokaciju i njene resurse." />
        : <><section className="panel"><div className="form-grid">
          <label>Lokacija<select value={locationId}
            onChange={(event) => setLocationId(event.target.value)}>
            {locations.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
          </select></label>
          <label>Zona<select value={areaId} disabled={!areas.length}
            onChange={(event) => setAreaId(event.target.value)}>
            {areas.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
          </select></label>
          <label>Početak<input type="datetime-local" value={start}
            onChange={(event) => setStart(event.target.value)} /></label>
        </div></section>
        {loading && <Skeleton lines={3} label="Osvežavanje mape" />}
        {!loading && !areas.length && <EmptyState title="Lokacija nema aktivne zone"
          description="Izaberite drugu lokaciju ili kontaktirajte administratora." />}
        {!loading && area && !resources.length && <EmptyState title="Zona nema resurse"
          description="Za izabrani termin nema konfigurisanih resursa." />}
        {!loading && area && resources.length > 0 && <section className="panel">
          <div aria-label={`Mapa zone ${area.name}`} style={{ position: 'relative', width: '100%',
            aspectRatio: `${area.mapWidth}/${area.mapHeight}`, background: '#f3f4f6',
            overflow: 'hidden', borderRadius: 12 }}>
            {resources.map((value) => <button key={value.id}
              disabled={value.status !== 'AVAILABLE'}
              onClick={() => navigate(`/my-reservations?serviceId=${value.serviceId}&resourceId=${value.id}`)}
              title={`${value.name}: ${value.status}`} style={{ position: 'absolute',
                left: `${value.x / area.mapWidth * 100}%`, top: `${value.y / area.mapHeight * 100}%`,
                width: `${value.width / area.mapWidth * 100}%`,
                height: `${value.height / area.mapHeight * 100}%`,
                transform: `rotate(${value.rotation}deg)`, border: '1px solid currentColor',
                borderRadius: 8, background: value.status === 'AVAILABLE' ? '#dcfce7'
                  : value.status === 'OCCUPIED' ? '#fee2e2' : '#e5e7eb' }}>
              {value.name}</button>)}
          </div><p aria-live="polite">Zeleno: slobodno · crveno: zauzeto · sivo: van funkcije</p>
        </section>}</>}
  </main>
}
