import { Button, Select } from '../components/ui'

export type FloorPlanTool = 'select' | 'room' | 'wall' | 'door' | 'resource'
const tools: { id: FloorPlanTool; label: string }[] = [{ id:'select',label:'Izaberi' },{ id:'room',label:'Prostorija' },{ id:'wall',label:'Zid' },{ id:'door',label:'Vrata / prolaz' },{ id:'resource',label:'Postavi resurs' }]
export function FloorPlanToolbar({ tool, onTool, busy, onAdd, onSave, onCancel, placing, onPlacing, resources }: {
  tool: FloorPlanTool; onTool: (tool: FloorPlanTool) => void; busy: boolean; onAdd: () => void; onSave: () => void; onCancel: () => void
  placing: string; onPlacing: (value: string) => void; resources: { id: string; name: string; areaName?: string }[]
}) {
  return <div className="resource-map-toolbar" role="toolbar" aria-label="Alati za uređivanje mape">
    {tools.map(item => <Button key={item.id} variant="secondary" aria-pressed={tool===item.id} disabled={busy} onClick={() => onTool(item.id)}>{item.label}</Button>)}
    {['room','wall','door'].includes(tool) && <Button variant="secondary" disabled={busy} onClick={onAdd}>Dodaj u centar</Button>}
    <Button loading={busy} onClick={onSave}>Sačuvaj</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Otkaži</Button>
    {tool==='resource'&&<label>Postojeći resurs<Select disabled={busy} value={placing} onChange={event=>onPlacing(event.target.value)}><option value="">Izaberite resurs</option>
      {resources.map(resource=><option key={resource.id} value={resource.id}>{resource.name} · {resource.areaName}</option>)}</Select></label>}
  </div>
}
