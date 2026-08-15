import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resourceApi } from '../api/resourceApi'
import { ResourcesPage } from './ResourcesPage'

vi.mock('../api/resourceApi', () => ({
  resourceApi: {
    locations: vi.fn(),
    areas: vi.fn(),
    availability: vi.fn(),
  },
}))

describe('ResourcesPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a stable empty state when there are no active locations', async () => {
    vi.mocked(resourceApi.locations).mockResolvedValue([])
    render(<MemoryRouter><ResourcesPage /></MemoryRouter>)

    expect(await screen.findByText('Nema dostupnih lokacija')).toBeInTheDocument()
    expect(resourceApi.areas).not.toHaveBeenCalled()
  })

  it('clears loading and renders an API error with a retry action', async () => {
    vi.mocked(resourceApi.locations).mockRejectedValue(new Error('network'))
    render(<MemoryRouter><ResourcesPage /></MemoryRouter>)

    expect(await screen.findByText('Lokacije nisu dostupne.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pokušaj ponovo' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Učitavanje lokacija')).not.toBeInTheDocument())
  })
})
