import axios from 'axios'

export class IdempotencyKeyManager {
  private key: string | null = null
  private readonly generate: () => string

  constructor(generate: () => string = () => crypto.randomUUID()) {
    this.generate = generate
  }

  begin(): string {
    this.key ??= this.generate()
    return this.key
  }

  succeeded(): void { this.key = null }

  failed(error: unknown): void {
    const retainForRetry = axios.isAxiosError(error)
      && (!error.response || error.response.status === 425)
    if (!retainForRetry) this.key = null
  }

  pendingKey(): string | null { return this.key }
}

export function isConflictResponse(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409
}
