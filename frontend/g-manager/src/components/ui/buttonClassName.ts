export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'warning' | 'ghost'
export type ControlSize = 'small' | 'medium' | 'large'

export function buttonClassName({ variant = 'primary', size = 'medium', iconOnly = false, className = '' }: {
  variant?: ButtonVariant; size?: ControlSize; iconOnly?: boolean; className?: string
} = {}) {
  return `ui-button ui-button--${variant} ui-button--${size}${iconOnly ? ' ui-button--icon' : ''} ${className}`.trim()
}
