import axios from 'axios'

export class IdempotencyKeyManager {
  private key: string | null = null
  private uncertain = false
  private readonly generate: () => string

  constructor(generate: () => string = () => crypto.randomUUID()) {
    this.generate = generate
  }

  begin(): string {
    this.key ??= this.generate()
    return this.key
  }

  succeeded(): void { this.key = null; this.uncertain = false }

  failed(error: unknown): void {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    const retainForRetry = axios.isAxiosError(error) && (!error.response || status === 425 || (status ?? 0) >= 500
      || status === 409 && /idempotency[- ]?key/i.test(String(error.response?.data?.message ?? ''))
      || this.uncertain && (status === 401 || status === 403))
    this.uncertain = retainForRetry
    if (!retainForRetry) this.key = null
  }

  pendingKey(): string | null { return this.key }
}

export function isConflictResponse(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409
}
