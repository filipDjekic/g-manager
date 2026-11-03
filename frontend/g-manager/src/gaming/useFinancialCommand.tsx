import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { IdempotencyKeyManager } from '../api/idempotency'
import { apiErrorMessage } from '../api/client'
import { useDirtyGuard } from '../forms/useDirtyGuard'
import { Alert, Button } from '../components/ui'
export function useFinancialCommand(onDone?: () => void) {
  const client = useQueryClient(), gate = useRef(false), key = useRef(new IdempotencyKeyManager())
  const previous = useRef<((key: string) => Promise<unknown>) | null>(null)
  const [busy, setBusy] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState('')
  useDirtyGuard(busy || pending, { pending: busy || pending })
  async function run(operation: (key: string) => Promise<unknown>) {
    if (gate.current) return
    gate.current = true; setBusy(true); setError('')
    const request = previous.current ?? operation
    try {
      await request(key.current.begin()); key.current.succeeded(); previous.current = null; setPending(false)
      await Promise.allSettled([client.invalidateQueries({ queryKey: ['gaming-operations'] }), client.invalidateQueries({ queryKey: ['gaming-wallet'] }), client.invalidateQueries({ queryKey: ['gaming-billing'] })])
      onDone?.()
    } catch (cause) {
      key.current.failed(cause); previous.current = key.current.pendingKey() ? request : null; setPending(!!previous.current)
      setError(apiErrorMessage(cause, 'Operacija nije uspela.'))
    } finally { gate.current = false; setBusy(false) }
  }
  return { run, busy, locked: busy || pending, feedback: error && <Alert tone="danger">{error}{pending && <><p>Ishod nije potvrdjen. Proverite isti zahtev pre nove operacije.</p><Button type="button" disabled={busy} onClick={() => previous.current && void run(previous.current)}>Proveri prethodni zahtev</Button></>}</Alert> }
}
