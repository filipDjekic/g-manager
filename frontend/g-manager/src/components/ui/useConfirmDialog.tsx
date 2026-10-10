import { useRef, useState } from 'react'
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'

type ConfirmationRequest = Omit<ConfirmDialogProps, 'open' | 'onClose' | 'onCancel'>

export function useConfirmDialog() {
  const [request, setRequest] = useState<{ options: ConfirmationRequest; id: number } | null>(null)
  const sequence = useRef(0)
  const confirm = (options: ConfirmationRequest) => setRequest({ options, id: ++sequence.current })
  const confirmationDialog = request ? <ConfirmDialog key={request.id} {...request.options} open onClose={() => setRequest(null)} /> : null
  return { confirm, confirmationDialog }
}
