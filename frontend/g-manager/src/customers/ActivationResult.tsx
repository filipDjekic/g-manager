import { useId, useRef, useEffect, useState } from 'react'
import { Button, Textarea } from '../components/ui'
import { formatBusinessDateTime } from '../reservations/dateTime'

export function ActivationResult({ secret, expiresAt }: { secret: string; expiresAt: string }) {
  const id = useId(), input = useRef<HTMLTextAreaElement>(null), [status, setStatus] = useState('')
  useEffect(() => { input.current?.focus({ preventScroll: true }) }, [])
  async function copy() {
    try { await navigator.clipboard.writeText(secret); setStatus('Kod je kopiran. Predajte ga klijentu.') }
    catch { setStatus('Označite kod i kopirajte ga ručno.') }
  }
  return <div className="customers-activation"><p>Predajte ovaj jednokratni kod klijentu. Posle zatvaranja više neće biti prikazan.</p>
    <label htmlFor={id}>Aktivacioni kod</label><Textarea ref={input} id={id} rows={3} readOnly value={secret}
      autoComplete="off" spellCheck={false} onFocus={event => event.currentTarget.select()} />
    <Button variant="secondary" onClick={() => void copy()}>Kopiraj kod</Button><p role="status">{status}</p>
    <p>Važi do {formatBusinessDateTime(expiresAt)}</p></div>
}
