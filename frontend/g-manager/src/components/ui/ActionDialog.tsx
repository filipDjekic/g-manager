import { useCallback, useState } from 'react'
import { Button, Modal } from './index'

export function ActionDialog({ open, title, description, confirmLabel, reasonLabel,
  reasonRequired = false, loading = false, danger = false, onClose, onConfirm }: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  reasonLabel?: string
  reasonRequired?: boolean
  loading?: boolean
  danger?: boolean
  onClose: () => void
  onConfirm: (reason?: string) => void
}) {
  const [reason, setReason] = useState('')
  const close = useCallback(() => { setReason(''); onClose() }, [onClose])
  return <Modal open={open} title={title} onClose={close}>
    <p>{description}</p>
    {reasonLabel && <label>{reasonLabel}<textarea maxLength={500} required={reasonRequired} value={reason}
      onChange={(event) => setReason(event.target.value)} /></label>}
    <div className="dialog-actions">
      <Button type="button" variant="secondary" onClick={close}>Odustani</Button>
      <Button type="button" variant={danger ? 'danger' : 'primary'} loading={loading}
        disabled={reasonRequired && !reason.trim()}
        onClick={() => onConfirm(reason.trim() || undefined)}>{confirmLabel}</Button>
    </div>
  </Modal>
}
