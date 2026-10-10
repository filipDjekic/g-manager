import { useId, useRef, useState } from 'react'
import { Button, Modal } from '../components/ui'

export const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const padded = (value: number) => String(value).padStart(2, '0')

export function ReservationTimePicker({label,value,onChange,disabled}: {
  label: string; value: string; onChange: (value: string) => void; disabled: boolean
}) {
  const [open, setOpen] = useState(false), [mode, setMode] = useState<'hours' | 'minutes'>('hours')
  const [hour, setHour] = useState(0), [minute, setMinute] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null), id = useId()
  const ticks = Array.from({length: 12}, (_,index) => mode === 'hours' ? index + (hour >= 12 ? 12 : 0) : index * 5)
  const angle = (mode === 'hours' ? hour % 12 : minute / 5) * 30
  return <div className="reservation-time-field">
    <label htmlFor={id}>{label} (HH:mm)</label><div className="reservation-time-input">
      <input id={id} type="text" inputMode="numeric" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="14:30"
        required disabled={disabled} value={value} aria-invalid={!validTime(value) || undefined} onChange={event => {
          const entered = event.target.value.replace(/[^0-9:]/g,'')
          onChange(!entered.includes(':') && entered.length >= 3 ? `${entered.slice(0,2)}:${entered.slice(2,4)}` : entered)
        }} />
      <Button ref={trigger} type="button" variant="secondary" disabled={disabled} aria-haspopup="dialog" aria-label={`Izaberi vreme ${label.toLowerCase()} preko sata`}
        onClick={() => {const parts = (validTime(value) ? value : '00:00').split(':');setHour(Number(parts[0]));setMinute(Number(parts[1]));setMode('hours');setOpen(true)}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>
      </Button></div>
    <Modal open={open} title={`Vreme ${label.toLowerCase()}`} className="reservation-time-dialog" returnFocusRef={trigger} onClose={() => setOpen(false)}
      footer={<div className="dialog-actions"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Odustani</Button>
        <Button type="button" onClick={() => {onChange(`${padded(hour)}:${padded(minute)}`);setOpen(false)}}>Potvrdi vreme</Button></div>}>
      <div className="reservation-clock-controls"><Button type="button" variant="secondary" aria-pressed={mode === 'hours'} onClick={() => setMode('hours')}>{padded(hour)}</Button>
        <span aria-hidden="true">:</span><Button type="button" variant="secondary" aria-pressed={mode === 'minutes'} onClick={() => setMode('minutes')}>{padded(minute)}</Button></div>
      {mode === 'hours' && <div className="reservation-clock-range" role="group" aria-label="Deo dana">
        <Button type="button" variant="secondary" aria-pressed={hour < 12} onClick={() => setHour(hour % 12)}>00–11</Button>
        <Button type="button" variant="secondary" aria-pressed={hour >= 12} onClick={() => setHour(hour % 12 + 12)}>12–23</Button>
      </div>}
      <div className="reservation-clock" role="group" aria-label={mode === 'hours' ? 'Izbor sata, 24-časovni format' : 'Izbor minuta'}>
        <span className="reservation-clock-hand" aria-hidden="true" style={{transform: `rotate(${angle}deg)`}} />
        {ticks.map(tick => {
          const radians = (mode === 'hours' ? tick % 12 : tick / 5) * Math.PI / 6
          const radius = 40
          const active = mode === 'hours' ? hour === tick : minute === tick
          return <button key={tick} type="button" className="reservation-clock-tick" aria-pressed={active}
            aria-label={`${padded(tick)} ${mode === 'hours' ? 'časova' : 'minuta'}`} style={{left:`${50 + Math.sin(radians) * radius}%`,top:`${50 - Math.cos(radians) * radius}%`}}
            onClick={() => {if(mode === 'hours'){setHour(tick);setMode('minutes')}else setMinute(tick)}}>{padded(tick)}</button>
        })}
      </div>
      <label className="reservation-clock-manual">Ručni unos (HH:mm)<input type="time" step={60} value={`${padded(hour)}:${padded(minute)}`}
        onChange={event => {if(validTime(event.target.value)){const parts=event.target.value.split(':');setHour(Number(parts[0]));setMinute(Number(parts[1]))}}}/></label>
      <div className="reservation-clock-quarters" role="group" aria-label="Koraci od 15 minuta">{[0,15,30,45].map(value =>
        <Button key={value} type="button" variant="secondary" aria-pressed={minute === value} onClick={() => setMinute(value)}>{padded(value)} min</Button>)}</div>
    </Modal>
  </div>
}
