import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { apiErrorMessage } from '../api/client'
import { customerApi } from '../api/customerApi'
import { Button, EmptyState, ErrorState, Input, Skeleton, Textarea } from '../components/ui'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import type { CustomerCrmNote } from '../types/customer.types'
import { customerDate } from './CustomerTable'

export function CustomerCrmPanel({ customerId }: { customerId: string }) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const client = useQueryClient()
  const [search, setSearch] = useState(''), [debounced, setDebounced] = useState('')
  const [note, setNote] = useState(''), [tag, setTag] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])
  const crm = useQuery({ queryKey: ['customers', 'crm', customerId, debounced],
    queryFn: () => customerApi.crm(customerId, debounced || undefined) })
  const refresh = () => client.invalidateQueries({ queryKey: ['customers', 'crm', customerId] })
  async function save(event: FormEvent, kind: 'NOTE' | 'TAG') {
    event.preventDefault()
    const value = (kind === 'NOTE' ? note : tag).trim()
    if (!value || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      if (kind === 'NOTE') { await customerApi.addCrmNote(customerId, value); setNote('') }
      else { await customerApi.addCrmTag(customerId, value); setTag('') }
      await refresh()
    } catch (cause) { setError(apiErrorMessage(cause, 'CRM podatke nije moguće sačuvati.')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const editNote = (item: CustomerCrmNote) => confirm({ title: 'Izmeni CRM belešku',
    description: 'Sačuvajte ažuriranu belešku o klijentu.', confirmLabel: 'Sačuvaj belešku',
    reasonLabel: 'Beleška', reasonRequired: true, initialReason: item.body, reasonMaxLength: 1000,
    errorMessage: 'Belešku nije moguće izmeniti.', onConfirm: async body => {
      await customerApi.updateCrmNote(customerId, item.id, body!, item.version); await refresh()
    } })
  const removeNote = (item: CustomerCrmNote) => confirm({ title: 'Obriši CRM belešku',
    description: 'Beleška će biti uklonjena iz evidencije klijenta.', confirmLabel: 'Obriši belešku',
    variant: 'danger', errorMessage: 'Belešku nije moguće obrisati.', onConfirm: async () => {
      await customerApi.deleteCrmNote(customerId, item.id, item.version); await refresh()
    } })
  async function removeTag(value: string) {
    if (!crm.data || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try { await customerApi.removeCrmTag(customerId, value, crm.data.version); await refresh() }
    catch (cause) { setError(apiErrorMessage(cause, 'Tag nije moguće ukloniti.')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <section className="customers-crm">
    {confirmationDialog}
    <div className="customers-section-heading"><h3>CRM beleške i tagovi</h3><p>Interna evidencija o klijentu.</p></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <label>Pretraži beleške i tagove<Input type="search" value={search} placeholder="Pretraži CRM…"
      onChange={event => setSearch(event.target.value)} /></label>
    <form className="customers-tag-form" onSubmit={event => void save(event, 'TAG')}>
      <label>Novi tag<Input maxLength={60} value={tag} disabled={busy} onChange={event => setTag(event.target.value)} /></label>
      <Button type="submit" variant="secondary" disabled={!tag.trim()} loading={busy}>Dodaj tag</Button>
    </form>
    {crm.isLoading ? <Skeleton lines={3} label="Učitavanje CRM podataka" /> : crm.error ?
      <ErrorState message={apiErrorMessage(crm.error, 'CRM podaci nisu dostupni.')}
        action={<Button onClick={() => void crm.refetch()}>Pokušaj ponovo</Button>} /> : <>
        <div className="customers-tags" aria-label="Tagovi klijenta">
          {crm.data?.tags.map(value => <Button type="button" variant="secondary" key={value} disabled={busy}
            aria-label={`Ukloni tag ${value}`} onClick={() => void removeTag(value)}>{value}<span aria-hidden="true">×</span></Button>)}
          {!crm.data?.tags.length && <small>{debounced ? 'Nema tagova za ovu pretragu.' : 'Nema dodatih tagova.'}</small>}
        </div>
        <form className="customers-note-form" onSubmit={event => void save(event, 'NOTE')}>
          <label>Nova beleška<Textarea maxLength={1000} rows={3} value={note} disabled={busy}
            onChange={event => setNote(event.target.value)} /></label>
          <Button type="submit" disabled={!note.trim()} loading={busy}>Sačuvaj belešku</Button>
        </form>
        {crm.data?.notes.length ? <div className="customers-notes">{crm.data.notes.map(item => <article key={item.id}>
          <p>{item.body}</p><small>Ažurirano {customerDate(item.updatedAt)} · Zadržava se do {customerDate(item.expiresAt)}</small>
          <div className="customers-inline-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => editNote(item)}>Izmeni</Button>
            <Button type="button" variant="danger" disabled={busy} onClick={() => removeNote(item)}>Obriši</Button>
          </div>
        </article>)}</div> : <EmptyState title={debounced ? 'Nema rezultata CRM pretrage' : 'Nema CRM beleški'}
          description={debounced ? 'Promenite pretragu da biste pronašli beleške.' : 'Dodajte prvu belešku o klijentu.'} />}
      </>}
  </section>
}
