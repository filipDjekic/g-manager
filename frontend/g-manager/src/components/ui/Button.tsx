import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { buttonClassName, type ButtonVariant, type ControlSize } from './buttonClassName'
export type { ButtonVariant, ControlSize } from './buttonClassName'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: ControlSize; loading?: boolean; iconOnly?: boolean
}>(function Button({ variant = 'primary', size = 'medium', loading = false, disabled, children, className = '', iconOnly = false, type = 'button', ...props }, ref) {
  return <button ref={ref} className={buttonClassName({ variant, size, iconOnly, className })}
    type={type} disabled={disabled || loading} aria-busy={loading || undefined} data-icon-only={iconOnly || undefined} {...props}>
    {loading ? <><span className="ui-spinner" aria-hidden="true" />{children}</> : children}
  </button>
})

