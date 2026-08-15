import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { resourceApi } from '../api/resourceApi'
import type { AreaView, LocationView, ResourceAvailability } from '../types/resource.types'

export function ResourcesPage() {
  const navigate = useNavigate()
  const [locations, setLocations] = useState<LocationView[]>([])
  const [areas, setAreas] = useState<AreaView[]>([])
  const [resources, setResources] = useState<ResourceAvailability[]>([])
  const [locationId, setLocationId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [start, setStart] = useState(() => new Date(Date.now() + 3600000).toISOString().slice(0, 16))
  const [error, setError] = useState('')

  useEffect(() => { void resourceApi.locations().then((values) => {
    setLocations(values); setLocationId(values[0]?.id ?? '')
  }).catch((cause) => setError(apiErrorMessage(cause, 'Lokacije nisu dostupne.'))) }, [])
  useEffect(() => { if (locationId) void resourceApi.areas(locationId).then((values) => {
    setAreas(values); setAreaId(values[0]?.id ?? '')
  }) }, [locationId])
  useEffect(() => {
    if (!areaId || !start) return
    const from = new Date(start).toISOString()
    const to = new Date(new Date(start).getTime() + 3600000).toISOString()
    void resourceApi.availability(areaId, from, to).then(setResources)
      .catch((cause) => setError(apiErrorMessage(cause, 'Mapa nije dostupna.')))
  }, [areaId, start])

  const area = areas.find((value) => value.id === areaId)
  return <main className="page">
    <header className="page-header"><div><p className="eyebrow">Prostor i kapacitet</p>
      <h1>Mapa resursa</h1><p>Izaberite lokaciju, zonu i vreme.</p></div></header>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    <section className="panel"><div className="form-grid">
      <label>Lokacija<select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
        {locations.filter((value) => value.active).map((value) =>
          <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label>Zona<select value={areaId} onChange={(event) => setAreaId(event.target.value)}>
        {areas.filter((value) => value.active).map((value) =>
          <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label>Početak<input type="datetime-local" value={start}
        onChange={(event) => setStart(event.target.value)} /></label>
    </div></section>
    {area && <section className="panel">
      <div aria-label={`Mapa zone ${area.name}`} style={{ position: 'relative', width: '100%',
        aspectRatio: `${area.mapWidth}/${area.mapHeight}`, background: '#f3f4f6',
        overflow: 'hidden', borderRadius: 12 }}>
        {resources.map((value) => <button key={value.id} disabled={value.status !== 'AVAILABLE'}
          onClick={() => navigate(`/my-reservations?serviceId=${value.serviceId}&resourceId=${value.id}`)}
          title={`${value.name}: ${value.status}`} style={{ position: 'absolute',
            left: `${value.x / area.mapWidth * 100}%`, top: `${value.y / area.mapHeight * 100}%`,
            width: `${value.width / area.mapWidth * 100}%`, height: `${value.height / area.mapHeight * 100}%`,
            transform: `rotate(${value.rotation}deg)`, border: '1px solid currentColor', borderRadius: 8,
            background: value.status === 'AVAILABLE' ? '#dcfce7'
              : value.status === 'OCCUPIED' ? '#fee2e2' : '#e5e7eb' }}>{value.name}</button>)}
      </div><p aria-live="polite">Zeleno: slobodno · crveno: zauzeto · sivo: van funkcije</p>
    </section>}
  </main>
}
