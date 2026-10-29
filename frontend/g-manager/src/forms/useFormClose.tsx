import { useConfirmDialog } from '../components/ui/useConfirmDialog'

/** Local dialog dismissal shares the same distinction as route navigation. */
export function useFormClose(dirty: boolean, pending: boolean, onClose: () => void) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  function close() {
    if (pending) return
    if (!dirty) { onClose(); return }
    confirm({ title: 'Odbaci unose?', description: 'Nesačuvani podaci u ovom formularu biće odbačeni.', variant: 'warning',
      confirmLabel: 'Odbaci unose', cancelLabel: 'Nastavi unos', onConfirm: onClose })
  }
  return { close, confirmationDialog }
}
