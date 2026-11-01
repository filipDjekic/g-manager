import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { testMapResource } from '../test/resourceFixtures'
import { ResourceTable } from './ResourceTable'

function Location() { const location = useLocation(); return <output aria-label="URL">{location.search}</output> }
function table(path = '/resources?resourcePage=99&resourceSize=10', areaId = '') {
  const details = vi.fn()
  const resources = Array.from({ length: 24 }, (_, index) => ({ ...testMapResource({ id: `pc-${index}`, name: `Station ${index + 1}`, code: `PC-${index + 1}` }), areaName: index % 2 ? 'Blue room' : 'Red room', areaId: index % 2 ? 'blue' : 'red', status: index % 3 === 0 ? 'OCCUPIED' as const : 'AVAILABLE' as const, type: index % 2 ? 'PLAYSTATION' as const : 'GAMING_PC' as const }))
  render(<MemoryRouter initialEntries={[path]}><Location /><ResourceTable resources={resources} areaId={areaId} actions={resource => [{ label: 'Details', onClick: () => details(resource.id) }]} /></MemoryRouter>)
  return details
}
function names() { return within(screen.getByRole('table')).getAllByRole('row').slice(1).map(row => row.querySelector('strong')!.textContent) }

describe('resource list navigation and filters', () => {
  it('clamps stale pages, preserves unrelated parameters and paginates the actual records', async () => {
    table('/resources?resourcePage=99&resourceSize=10&locationId=loc-1')
    await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('resourcePage=3'))
    expect(names()).toEqual(['Station 21', 'Station 22', 'Station 23', 'Station 24'])
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Stranica 1' }))
    expect(names()).toHaveLength(10); expect(names()[0]).toBe('Station 1')
    expect(screen.getByLabelText('URL')).toHaveTextContent('locationId=loc-1')
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('resourcePage=')
    const size = screen.getByRole('combobox', { name: 'Po stranici' })
    await user.selectOptions(size, '50')
    expect(names()).toHaveLength(24)
    expect(screen.getByLabelText('URL')).toHaveTextContent('resourceSize=50')
  })

  it('combines search, type, status and zone filters while keeping resource actions accessible', async () => {
    const details = table('/resources?resourcePage=invalid&resourceSize=999', 'blue'), user = userEvent.setup()
    expect(await screen.findByRole('heading', { name: 'Resursi u zoni' })).toBeVisible()
    expect(names()).toHaveLength(10)
    await user.selectOptions(screen.getByLabelText('Tip'), 'PLAYSTATION')
    await user.selectOptions(screen.getByLabelText('Status intervala'), 'OCCUPIED')
    expect(names()).toEqual(['Station 4', 'Station 10', 'Station 16', 'Station 22'])
    await user.selectOptions(screen.getByLabelText('Sortiranje'), 'name-desc')
    expect(names()[0]).toBe('Station 22')
    await user.type(screen.getByLabelText('Pretraga'), ' pc-10 ')
    expect(names()).toEqual(['Station 10'])
    await user.click(screen.getByRole('button', { name: 'Akcije · Station 10' }))
    await user.click(screen.getByRole('menuitem', { name: 'Details' }))
    expect(details).toHaveBeenCalledWith('pc-9')
    fireEvent.change(screen.getByLabelText('Pretraga'), { target: { value: 'not present' } })
    expect(screen.getByText('Nema resursa za ovaj izbor')).toBeVisible()
  })

  it.each(['type', 'area', 'status'])('orders all records by %s with a deterministic name/id tie break', async sort => {
    table('/resources?resourceSize=50&resourcePage=9007199254740992')
    await userEvent.setup().selectOptions(screen.getByLabelText('Sortiranje'), sort)
    expect(names()).toHaveLength(24)
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    const column = sort === 'type' ? 1 : sort === 'area' ? 2 : 3
    const values = rows.map(row => within(row).getAllByRole('cell')[column].textContent!)
    expect(values).toEqual([...values].sort((a, b) => a.localeCompare(b, 'sr', { numeric: true })))
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('resourcePage=')
  })
})
