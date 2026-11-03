import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gamingBillingApi, type Purchase, type PaymentMethod } from '../api/gamingBillingApi'

export function useGamingPurchase(resourceId: string, minutes: number, customerId?: string) {
  const [chosen, setChosen] = useState(''), [discount, setDiscount] = useState('0'), [reason, setReason] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('CASH'), [reference, setReference] = useState(''), [packageId, setPackageId] = useState('')
  const [amount, setAmount] = useState<{ quote: string; value: string } | null>(null)
  const tariffs = useQuery({ queryKey: ['gaming-billing', 'tariffs'], queryFn: gamingBillingApi.tariffs })
  const tariffId = chosen || tariffs.data?.find(t => t.active)?.id || ''
  const quote = useQuery({ queryKey: ['gaming-billing', 'quote', resourceId, tariffId, minutes, discount, method, packageId], queryFn: () => gamingBillingApi.quote(resourceId, tariffId, minutes, discount, method === 'TIME_PACKAGE' ? packageId : undefined), enabled: !!resourceId && (method === 'TIME_PACKAGE' ? !!packageId : !!tariffId) && minutes > 0 })
  const wallet = useQuery({ queryKey: ['gaming-wallet', customerId], queryFn: () => gamingBillingApi.wallet(customerId!), enabled: !!customerId })
  const quoteKey = JSON.stringify(quote.data), paymentAmount = method === 'TIME_PACKAGE' ? '0' : amount && amount.quote === quoteKey ? amount.value : String(quote.data?.total ?? '')
  const purchase: Purchase | undefined = quote.data && !quote.isFetching && !quote.error ? { tariffId: quote.data.tariffId, tariffVersion: quote.data.tariffVersion, discountPercent: discount, reason, payment: { method, amount: paymentAmount, reference }, packageId: method === 'TIME_PACKAGE' ? packageId : undefined } : undefined
  return { tariffs, tariffId, setChosen, discount, setDiscount, reason, setReason, method, setMethod, reference, setReference, packageId, setPackageId, quote, wallet, paymentAmount, setAmount: (value: string) => setAmount({ quote: quoteKey, value }), purchase,
    valid: !!purchase && paymentAmount !== '' && (method !== 'EXTERNAL_POS' || !!reference.trim()) && (method !== 'TIME_PACKAGE' || !!customerId && !!packageId) }
}
export type GamingPurchaseModel = ReturnType<typeof useGamingPurchase>
