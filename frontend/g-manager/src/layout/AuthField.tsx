import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { Input } from '../components/ui'

type AuthFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & {
  id: string
  label: string
  icon: 'email' | 'key' | 'lock'
  error?: string
  hint?: ReactNode
  passwordToggle?: { visible: boolean; label: string; onToggle: () => void; disabled?: boolean }
}

export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField({
  id, label, icon, error, hint, passwordToggle, 'aria-describedby': describedBy, ...props
}, ref) {
  const description = [error && `${id}-error`, hint && `${id}-hint`, describedBy].filter(Boolean).join(' ') || undefined

  return <div className="gm-auth-field">
    <label htmlFor={id}>{label}</label>
    <div className={`gm-auth-control${passwordToggle ? ' gm-auth-control--password' : ''}`}>
      <svg className="gm-auth-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {icon === 'email' && <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>}
        {icon === 'key' && <><circle cx="8" cy="8" r="5" /><path d="m11.5 11.5 9 9M16 16l3-3M18 18l3-3" /></>}
        {icon === 'lock' && <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>}
      </svg>
      <Input {...props} ref={ref} id={id} aria-invalid={!!error} aria-describedby={description}
        type={passwordToggle ? (passwordToggle.visible ? 'text' : 'password') : props.type} />
      {passwordToggle && <button className="gm-auth-password-toggle" type="button" aria-controls={id}
        aria-label={passwordToggle.label} disabled={props.disabled || passwordToggle.disabled}
        onClick={passwordToggle.onToggle}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {passwordToggle.visible && <path d="m3 3 18 18" />}
        </svg>
      </button>}
    </div>
    {error && <span id={`${id}-error`} className="field-error" role="alert">{error}</span>}
    {hint && <div id={`${id}-hint`} className="gm-auth-hint">{hint}</div>}
  </div>
})
