import { cloneElement, forwardRef, isValidElement, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`ui-input ${className}`} {...props} />
  })

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', ...props }, ref) {
    return <select ref={ref} className={`ui-input ${className}`} {...props} />
  })

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...props }, ref) {
    return <textarea ref={ref} className={`ui-input ${className}`} {...props} />
  })

export function FormField({ label, htmlFor, error, hint, children }: {
  label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode
}) {
  const hintId = `${htmlFor}-hint`
  const errorId = `${htmlFor}-error`
  const descriptionIds = [hint && !error ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, { id: children.props.id ?? htmlFor,
      'aria-describedby': [children.props['aria-describedby'], descriptionIds].filter(Boolean).join(' ') || undefined,
      'aria-invalid': Boolean(error) || undefined })
    : children
  return <div className="ui-field">
    <label htmlFor={htmlFor}>{label}</label>
    <span className="ui-field-control">{control}</span>
    {hint && !error && <span id={hintId} className="ui-field-hint">{hint}</span>}
    <span id={errorId} className="field-error" role={error ? 'alert' : undefined}>{error}</span>
  </div>
}

