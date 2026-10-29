import { forwardRef, type ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'warning' | 'ghost'
export type ControlSize = 'small' | 'medium' | 'large'

export function buttonClassName({ variant = 'primary', size = 'medium', iconOnly = false, className = '' }: {
  variant?: ButtonVariant; size?: ControlSize; iconOnly?: boolean; className?: string
} = {}) {
  return `ui-button ui-button--${variant} ui-button--${size}${iconOnly ? ' ui-button--icon' : ''} ${className}`.trim()
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: ControlSize; loading?: boolean; iconOnly?: boolean
}>(function Button({ variant = 'primary', size = 'medium', loading = false, disabled, children, className = '', iconOnly = false, type = 'button', ...props }, ref) {
  return <button ref={ref} className={buttonClassName({ variant, size, iconOnly, className })}
    type={type} disabled={disabled || loading} aria-busy={loading || undefined} data-icon-only={iconOnly || undefined} {...props}>
    {loading ? <><span className="ui-spinner" aria-hidden="true" />{children}</> : children}
  </button>
})

