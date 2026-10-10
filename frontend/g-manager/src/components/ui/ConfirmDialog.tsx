import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { apiErrorMessage } from '../../api/client'
import { Button, FormField, Input, Modal, Textarea } from './index'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'warning' | 'danger'
  loading?: boolean
  disabled?: boolean
  error?: string
  errorMessage?: string
  reasonLabel?: string
  reasonRequired?: boolean
  initialReason?: string
  reasonMaxLength?: number
  inputMode?: 'text' | 'textarea'
  autoClose?: boolean
  onConfirm: (reason?: string) => void | Promise<unknown>
  onClose: () => void
  onCancel?: () => void
}

function Confirmation({ title, description, confirmLabel = 'Potvrdi', cancelLabel = 'Odustani',
  variant = 'default', loading = false, disabled = false, error, errorMessage = 'Akciju nije moguće izvršiti.',
  reasonLabel, reasonRequired = false, initialReason = '', reasonMaxLength = 500,
  inputMode = 'textarea', autoClose = true, onConfirm, onClose, onCancel }: ConfirmDialogProps) {
  const [reason, setReason] = useState(initialReason)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState('')
  const submitting = useRef(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const id = useId(), formId = `${id}-form`, descriptionId = `${id}-description`
  const busy = loading || pending
  const showReason = Boolean(reasonLabel || reasonRequired)
  const invalid = reasonRequired && !reason.trim()
  const close = () => { if (!busy && !submitting.current) (onCancel ?? onClose)() }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current || busy || disabled || invalid) return
    submitting.current = true; setPending(true); setFailure('')
    try {
      await onConfirm(reason.trim() || undefined)
      if (autoClose) onClose()
    } catch (cause) { setFailure(apiErrorMessage(cause, errorMessage)) }
    finally { submitting.current = false; setPending(false) }
  }

  return <Modal open title={title} onClose={close} closeDisabled={busy}
    className={`ui-confirm ui-confirm--${variant}`} descriptionId={descriptionId}
    initialFocusRef={showReason ? inputMode === 'text' ? inputRef : textareaRef : cancelRef}
    footer={<div className="dialog-actions">
      <Button ref={cancelRef} type="button" variant="secondary" disabled={busy} onClick={close}>{cancelLabel}</Button>
      <Button type="submit" form={formId} variant={variant === 'danger' ? 'danger' : 'primary'}
        loading={busy} disabled={disabled || invalid}>{confirmLabel}</Button>
    </div>}>
    <form id={formId} className="form-grid" onSubmit={submit}>
      <div id={descriptionId} className="confirmation-description">{description}</div>
      {showReason && <FormField label={reasonLabel ?? 'Razlog'} htmlFor={`${id}-reason`}
        hint={reasonRequired ? 'Obavezno obrazloženje.' : 'Opciono obrazloženje.'}>
        {inputMode === 'text' ? <Input ref={inputRef} id={`${id}-reason`} value={reason} maxLength={reasonMaxLength}
          required={reasonRequired} disabled={busy || disabled} onChange={(event) => setReason(event.target.value)} /> :
          <Textarea ref={textareaRef} id={`${id}-reason`} value={reason} maxLength={reasonMaxLength}
            required={reasonRequired} disabled={busy || disabled} onChange={(event) => setReason(event.target.value)} />}
      </FormField>}
      {(failure || error) && <p className="error-banner" role="alert">{failure || error}</p>}
    </form>
  </Modal>
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  return props.open ? <Confirmation {...props} /> : null
}
