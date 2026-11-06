import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gamingTimeApi, type GamingPaymentMethod, type TimeGrant } from '../api/gamingTimeApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'

export function useGamingPurchase(customerId?: string, initialMinutes = 30) {
  const [minutes, setMinutes] = useState(initialMinutes)
  const [method, setMethod] = useState<GamingPaymentMethod>('CASH'), [reference, setReference] = useState('')
  const canPay = hasCapability(useAuthStore(s => s.user), 'GAMING_PAYMENT_RECORD')
  const account = useQuery({ queryKey: ['gaming-time', customerId], queryFn: () => gamingTimeApi.account(customerId!), enabled: !!customerId, refetchInterval: 5000 })
  const price = useQuery({ queryKey: ['gaming-time', 'price'], queryFn: gamingTimeApi.price, enabled: canPay })
  const validMinutes = Number.isSafeInteger(minutes) && minutes >= 30 && minutes <= 5256000
  const value = price.data?.pricePerMinute
  const match = value == null ? null : /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value))
  const cents = match ? BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : 0n
  const total = validMinutes ? cents * BigInt(minutes) : 0n
  const amount = total > 0n && total <= 99999999999999n ? `${total / 100n}.${String(total % 100n).padStart(2, '0')}` : null
  const valid = !!customerId && !!account.data && !account.error && !price.error && !!amount && cents > 0n
  const grant: TimeGrant = { minutes, priceVersion: price.data?.version ?? -1, method, ...(method === 'EXTERNAL_POS' && reference.trim() ? { reference: reference.trim() } : {}) }
  return { account, price, minutes, setMinutes, method, setMethod, reference, setReference, amount, validMinutes, valid, grant }
}
export type GamingPurchaseModel = ReturnType<typeof useGamingPurchase>
