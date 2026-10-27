import { useId, useRef, useState, type FormEvent } from 'react'
import { Button, FormField, Input, Modal, Select } from '../components/ui'
import { AuditIcon } from './auditPresentation'
import { defaultDraft, periodLabel, periods, sortOptions, validateDraft, type AuditDraft } from './auditPresentation.model'

export function AuditFilterDialog({ initial, onApply, onClose, returnFocusRef }: {
  initial: AuditDraft; onApply: (draft: AuditDraft) => void; onClose: () => void
  returnFocusRef: React.RefObject<HTMLElement | null>
}) {
  const [draft, setDraft] = useState(initial), [error, setError] = useState('')
  const id = useId(), periodRef = useRef<HTMLSelectElement>(null)
  function change(values: Partial<AuditDraft>) { setDraft(value => ({ ...value, ...values })); setError('') }
  function apply(event: FormEvent) {
    event.preventDefault()
    const next = { ...draft, action: draft.action.trim(), resourceType: draft.resourceType.trim(), actorId: draft.actorId.trim() }
    const message = validateDraft(next)
    if (message) { setError(message); return }
    onApply({ ...next, from: next.period === 'CUSTOM' ? next.from : '', to: next.period === 'CUSTOM' ? next.to : '' })
  }
  return <Modal open title="Filteri audit događaja" titleIcon={<AuditIcon kind="filters" />} className="gm-audit-dialog"
    onClose={onClose} initialFocusRef={periodRef} returnFocusRef={returnFocusRef} descriptionId={`${id}-description`}
    footer={<>
      <Button type="button" variant="secondary" onClick={() => { setDraft(defaultDraft()); setError('') }}><AuditIcon kind="reset" />Resetuj</Button>
      <div className="gm-audit-dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Otkaži</Button>
        <Button type="submit" form={`${id}-form`}>Primeni filtere</Button></div>
    </>}>
    <p id={`${id}-description`} className="gm-audit-muted">Preciznije pronađite aktivnosti i promene u sistemu.</p>
    <form id={`${id}-form`} onSubmit={apply} className="gm-audit-filter-form">
      <FormField label="Period" htmlFor={`${id}-period`} hint="Svi datumi koriste vremensku zonu Europe/Belgrade.">
        <Select id={`${id}-period`} ref={periodRef} value={draft.period} onChange={event => change({ period: event.target.value })}>
          {Object.entries(periods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </FormField>
      <FormField label="Sortiranje" htmlFor={`${id}-sort`}>
        <Select id={`${id}-sort`} value={`${draft.sort}:${draft.direction}`} onChange={event => {
          const option = sortOptions.find(item => `${item.sort}:${item.direction}` === event.target.value)
          if (option) change({ sort: option.sort, direction: option.direction })
        }}>{sortOptions.map(option => <option key={`${option.sort}:${option.direction}`} value={`${option.sort}:${option.direction}`}>{option.label}</option>)}</Select>
      </FormField>
      {draft.period === 'CUSTOM' && <>
        <FormField label="Datum od" htmlFor={`${id}-from`}><Input id={`${id}-from`} type="date" value={draft.from} max={draft.to || undefined} onChange={event => change({ from: event.target.value })} /></FormField>
        <FormField label="Datum do" htmlFor={`${id}-to`}><Input id={`${id}-to`} type="date" value={draft.to} min={draft.from || undefined} onChange={event => change({ to: event.target.value })} /></FormField>
      </>}
      <FormField label="Akcija" htmlFor={`${id}-action`} hint="Tačna action vrednost, npr. USER_CREATED. Prazno polje obuhvata sve akcije.">
        <Input id={`${id}-action`} value={draft.action} maxLength={80} placeholder="Sve akcije" onChange={event => change({ action: event.target.value })} />
      </FormField>
      <FormField label="Tip resursa" htmlFor={`${id}-resource`} hint="Tačna resourceType vrednost, npr. USER ili PHYSICAL_RESOURCE.">
        <Input id={`${id}-resource`} value={draft.resourceType} maxLength={80} placeholder="Svi resursi" onChange={event => change({ resourceType: event.target.value })} />
      </FormField>
      <div className="gm-audit-form-full"><FormField label="Izvršilac — ID korisnika" htmlFor={`${id}-actor`} hint="Unesite pun UUID iz detalja događaja. Prazno polje obuhvata sve dozvoljene izvršioce.">
        <Input id={`${id}-actor`} value={draft.actorId} maxLength={36} placeholder="UUID izvršioca" spellCheck={false} onChange={event => change({ actorId: event.target.value })} />
      </FormField></div>
      <p className="gm-audit-filter-period gm-audit-form-full"><AuditIcon kind="clock" />{periodLabel(draft)}</p>
      {error && <p className="gm-audit-form-error gm-audit-form-full" role="alert">{error}</p>}
    </form>
  </Modal>
}
