import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'

// Keep the existing API while sharing focus, validation and async handling.
export function ActionDialog({ danger = false, ...props }: Omit<ConfirmDialogProps, 'variant'> & { danger?: boolean }) {
  return <ConfirmDialog {...props} variant={danger ? 'danger' : 'default'} autoClose={false} />
}
