import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { server } from '../test/server'
import type { ReportItem, ReportSchedule, ReportTemplate } from '../types/report.types'
import { ReportsPage } from './ReportsPage'

const queued: ReportItem = { id: 'report-1', definitionKey: 'orders', format: 'CSV', status: 'QUEUED', progress: 0, rowCount: null, documentId: null, errorMessage: null, snapshotAt: '2028-03-16T10:00:00Z', expiresAt: null, version: 0 }
const schedule: ReportSchedule = { id: 'schedule-1', definitionKey: 'orders', format: 'CSV', timezone: 'Europe/Belgrade', localTime: '08:00', dayOfWeek: 1, active: true, nextRunAt: '2028-03-20T07:00:00Z', version: 0 }
function page() { return render(<MemoryRouter><ReportsPage /></MemoryRouter>) }
describe('report generation and scheduling transactions', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: authUser('OWNER'), accessToken: 'token', isInitializing: false })
    server.use(
      http.get('/api/v1/reports/definitions', () => HttpResponse.json([{ key: 'orders', label: 'Orders', metricDefinition: 'Created in period', formats: ['CSV', 'XLSX', 'PDF'] }])),
      http.get('/api/v1/reports', () => HttpResponse.json([])),
      http.get('/api/v1/reports/schedules', () => HttpResponse.json([])),
      http.get('/api/v1/reports/templates', () => HttpResponse.json([])),
    )
  })
  afterEach(() => vi.restoreAllMocks())

  it('preserves an exact template interval, saves a named template and generates the chosen format', async () => {
    const templates: ReportTemplate[] = [{ id: 'template-1', name: 'Exact period', definitionKey: 'orders', format: 'PDF', filters: '2028-03-16T12:30:00Z|2028-03-18T15:45:00Z', version: 0 }]
    let generated: unknown, saved: unknown
    server.use(http.get('/api/v1/reports/templates', () => HttpResponse.json(templates)),
      http.post('/api/v1/reports/templates', async ({ request }) => { saved = await request.json(); return HttpResponse.json(templates[0]) }),
      http.post('/api/v1/reports', async ({ request }) => { generated = await request.json(); return HttpResponse.json(queued) }))
    page(); const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Sačuvani šabloni'), 'template-1')
    expect(screen.getByLabelText('Format')).toHaveValue('PDF')
    expect(screen.getByText(/Period sačuvan u šablonu:/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Sačuvaj šablon' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Naziv šablona'), 'Monthly snapshot')
    await user.click(within(dialog).getByRole('button', { name: 'Sačuvaj šablon' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(saved).toMatchObject({ name: 'Monthly snapshot', from: '2028-03-16T12:30:00Z', to: '2028-03-18T15:45:00Z', format: 'PDF' })
    await user.click(screen.getByRole('button', { name: 'Generiši' }))
    await waitFor(() => expect(generated).toMatchObject({ from: '2028-03-16T12:30:00Z', to: '2028-03-18T15:45:00Z', format: 'PDF', timezone: 'Europe/Belgrade' }))
    for (const preset of ['Danas', 'Poslednjih 7 dana', 'Ovaj mesec', 'Poslednjih 30 dana']) await user.click(screen.getByRole('button', { name: preset }))
    expect(screen.queryByText(/Period sačuvan u šablonu:/)).not.toBeInTheDocument()
  })

  it('confirms cancellation and schedule removal and creates a daily schedule with the fixed period', async () => {
    let cancelled = false, deleted = false, created: unknown
    server.use(http.get('/api/v1/reports', () => HttpResponse.json(cancelled ? [{ ...queued, status: 'CANCELLED' }] : [queued])),
      http.get('/api/v1/reports/schedules', () => HttpResponse.json(deleted ? [] : [schedule])),
      http.post('/api/v1/reports/report-1/cancel', () => { cancelled = true; return HttpResponse.json({ ...queued, status: 'CANCELLED' }) }),
      http.delete('/api/v1/reports/schedules/schedule-1', () => { deleted = true; return new HttpResponse(null, { status: 204 }) }),
      http.post('/api/v1/reports/schedules', async ({ request }) => { created = await request.json(); return HttpResponse.json(schedule) }))
    page(); const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Otkaži' }))
    expect(cancelled).toBe(false)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Otkaži obradu' }))
    await screen.findByText('Otkazan')
    await user.click(screen.getByRole('button', { name: 'Obriši' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Obriši raspored' }))
    expect(await screen.findByText('Nema rasporeda.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Zakaži izveštaj' }))
    const dialog = screen.getByRole('dialog', { name: 'Zakaži izveštaj' })
    await user.selectOptions(within(dialog).getByLabelText('Učestalost'), '')
    fireEvent.change(within(dialog).getByLabelText('Lokalno vreme'), { target: { value: '09:30' } })
    fireEvent.change(within(dialog).getByLabelText('Vremenska zona'), { target: { value: 'Europe/London' } })
    await user.click(within(dialog).getByRole('button', { name: 'Sačuvaj raspored' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(created).toMatchObject({ dayOfWeek: null, localTime: '09:30', timezone: 'Europe/London', definitionKey: 'orders', from: expect.any(String), to: expect.any(String) })
  })

  it('rejects an invalid period before sending and retries an independently failed report listing', async () => {
    let calls = 0, generated = 0
    server.use(http.get('/api/v1/reports', () => ++calls === 1 ? HttpResponse.error() : HttpResponse.json([])),
      http.post('/api/v1/reports', () => { generated++; return HttpResponse.error() }))
    page(); const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Osveži' }))
    expect(await screen.findByText('Nema izveštaja')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Od'), { target: { value: '2028-03-20' } })
    fireEvent.change(screen.getByLabelText('Do - isključivi kraj'), { target: { value: '2028-03-16' } })
    await user.click(screen.getByRole('button', { name: 'Generiši' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Generisanje nije pokrenuto.')
    expect(generated).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Danas' }))
    await user.click(screen.getByRole('button', { name: 'Generiši' }))
    await waitFor(() => expect(generated).toBe(1))
    expect(screen.getByRole('alert')).toHaveTextContent('Generisanje nije pokrenuto.')
  })
})
