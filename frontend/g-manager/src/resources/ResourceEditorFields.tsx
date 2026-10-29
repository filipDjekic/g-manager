import { Input } from '../components/ui'

export function LocationFields({ address, timezone, onAddress, onTimezone, busy }: { address: string; timezone: string; onAddress: (value: string) => void; onTimezone: (value: string) => void; busy: boolean }) {
  return <><label>Adresa<Input required maxLength={255} value={address} disabled={busy} onChange={event=>onAddress(event.target.value)}/></label>
    <label>Vremenska zona<Input required maxLength={60} value={timezone} disabled={busy} onChange={event=>onTimezone(event.target.value)}/></label></>
}

export function AreaGeometryFields({ width, height, onWidth, onHeight, busy }: { width: number; height: number; onWidth: (value: number) => void; onHeight: (value: number) => void; busy: boolean }) {
  return <details className="ui-advanced-filters"><summary>Veličina mape zone</summary><div className="editor-columns">
    <label>Širina mape<Input required type="number" min={1} disabled={busy} value={width} onChange={event=>onWidth(Number(event.target.value))}/></label>
    <label>Visina mape<Input required type="number" min={1} disabled={busy} value={height} onChange={event=>onHeight(Number(event.target.value))}/></label>
  </div></details>
}

type Geometry = { x: number; y: number; width: number; height: number; rotation: number }
export function ResourceGeometryFields({ value, onChange, busy }: { value: Geometry; onChange: (patch: Partial<Geometry>) => void; busy: boolean }) {
  const labels: Record<keyof Geometry,string> = { x:'X',y:'Y',width:'Širina',height:'Visina',rotation:'Rotacija' }
  return <details className="ui-advanced-filters"><summary>Pozicija i dimenzije na mapi</summary><div className="editor-columns">
    {(Object.keys(labels) as (keyof Geometry)[]).map(key=><label key={key}>{labels[key]}<Input required type="number" disabled={busy} value={value[key]}
      min={key==='rotation'?undefined:key==='width'||key==='height'?1:0} onChange={event=>onChange({[key]:Number(event.target.value)})}/></label>)}
  </div></details>
}
