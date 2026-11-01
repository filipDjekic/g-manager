import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WaitlistEntry } from '../../types/waitlist.types'
import { CustomerWaitlist } from './CustomerWaitlist'

const now = Date.parse('2028-03-16T09:00:00Z')
const entry = (patch: Partial<WaitlistEntry> = {}): WaitlistEntry => ({ id: 'entry-1', serviceId: 'service-1', employeeId: 'employee-1', locationId: null, resourceId: null, desiredStart: '2028-03-16T10:00:00Z', desiredEnd: '2028-03-16T11:00:00Z', status: 'OFFERED', offerId: 'offer-1', offerExpiresAt: '2028-03-16T09:02:05Z', reservationId: null, version: 0, serviceName: 'Game hour', ...patch })
function props(entries: WaitlistEntry[] = []) { return { entries, now, synchronized: true, loading: false, fetching: false, error: null as unknown, pending: '', linkedOffer: 'offer-1', onRefresh: vi.fn(), onAccept: vi.fn(), onCancel: vi.fn(), onBook: vi.fn() } }

describe('customer waitlist offer boundaries', () => {
  it('allows acceptance only for an unexpired offer verified against synchronized server time', async () => {
    const value = entry({ locationName: 'Arena', resourceCode: 'PC-01', resourceName: 'First PC', employeeName: 'Eva' }), handlers = props([value]), user = userEvent.setup()
    const { rerender } = render(<CustomerWaitlist {...handlers} />)
    expect(screen.getByRole('timer')).toHaveTextContent('Preostalo 2:05')
    expect(screen.getByText('Arena · PC-01 · First PC · Eva')).toBeVisible()
    expect(screen.getByRole('article')).toHaveClass('is-linked')
    await user.click(screen.getByRole('button', { name: 'Prihvati termin' }))
    expect(handlers.onAccept).toHaveBeenCalledWith(value)
    rerender(<CustomerWaitlist {...handlers} synchronized={false} />)
    expect(screen.getByRole('timer')).toHaveTextContent('Sinhronizacija vremena…')
    expect(screen.getByRole('button', { name: 'Prihvati termin' })).toBeDisabled()
    rerender(<CustomerWaitlist {...handlers} pending={value.id} />)
    expect(screen.getByRole('button', { name: 'Otkaži prijavu' })).toBeDisabled()
    rerender(<CustomerWaitlist {...handlers} now={Date.parse(value.offerExpiresAt!)} />)
    expect(screen.getByText('Ponuda istekla')).toBeVisible()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prihvati termin' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Otkaži prijavu' }))
    expect(handlers.onCancel).toHaveBeenCalledWith(value)
  })

  it('distinguishes waiting, expired, accepted and cancelled entries without inventing resource data', () => {
    const entries = [entry({ id: 'waiting', status: 'WAITING', offerId: null, offerExpiresAt: null, serviceName: null, desiredEnd: null }),
      entry({ id: 'past', status: 'WAITING', desiredStart: '2028-03-15T10:00:00Z' }),
      entry({ id: 'expired', offerStatus: 'EXPIRED' }), entry({ id: 'accepted', status: 'ACCEPTED' }), entry({ id: 'cancelled', status: 'CANCELLED' })]
    render(<CustomerWaitlist {...props(entries)} />)
    const cards = screen.getAllByRole('article')
    expect(within(cards[0]).getByText('Usluga')).toBeVisible()
    expect(within(cards[0]).getByText('Resurs nije određen')).toBeVisible()
    expect(within(cards[1]).getByText('Izabrani termin je prošao. Ova prijava više nema važeću ponudu.')).toBeVisible()
    expect(within(cards[2]).getByRole('button', { name: 'Prihvati termin' })).toBeDisabled()
    expect(within(cards[3]).getByText('Prihvaćeno')).toBeVisible()
    expect(within(cards[4]).getByText('Otkazano')).toBeVisible()
    expect(within(cards[3]).queryByRole('button')).not.toBeInTheDocument()
    expect(within(cards[4]).queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers an explicit refresh after failure and a booking action in an empty list', async () => {
    const handlers = props(), user = userEvent.setup(), { rerender } = render(<CustomerWaitlist {...handlers} loading />)
    expect(screen.getAllByLabelText('Učitavanje liste čekanja')).toHaveLength(2)
    rerender(<CustomerWaitlist {...handlers} error={new Error('offline')} />)
    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(handlers.onRefresh).toHaveBeenCalledOnce()
    rerender(<CustomerWaitlist {...handlers} />)
    await user.click(screen.getByRole('button', { name: '+ Nova rezervacija' }))
    expect(handlers.onBook).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Osveži' }))
    expect(handlers.onRefresh).toHaveBeenCalledTimes(2)
  })
})
