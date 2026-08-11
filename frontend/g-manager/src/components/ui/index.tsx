import {
  cloneElement, forwardRef, isValidElement, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent, type SelectHTMLAttributes,
} from 'react'
import './ui.css'
import { ToastContext, type ToastTone } from './toastContext'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean
}>(function Button({ variant = 'primary', loading = false, disabled, children, className = '', ...props }, ref) {
  return <button ref={ref} className={`ui-button ui-button--${variant} ${className}`}
    disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading ? <><span className="ui-spinner" aria-hidden="true" />{children}</> : children}
  </button>
})

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`ui-input ${className}`} {...props} />
  })

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', ...props }, ref) {
    return <select ref={ref} className={`ui-input ${className}`} {...props} />
  })

export function FormField({ label, htmlFor, error, hint, children }: {
  label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode
}) {
  const hintId = `${htmlFor}-hint`
  const errorId = `${htmlFor}-error`
  const descriptionIds = [hint && !error ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, { 'aria-describedby': descriptionIds })
    : children
  return <label className="ui-field" htmlFor={htmlFor}>
    <span>{label}</span>
    <span className="ui-field-control">{control}</span>
    {hint && !error && <span id={hintId} className="ui-field-hint">{hint}</span>}
    <span id={errorId} className="field-error" role={error ? 'alert' : undefined}>{error}</span>
  </label>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`ui-card ${className}`}>{children}</section>
}

export function TableShell({ label, children }: { label: string; children: ReactNode }) {
  return <div className="ui-table-shell" role="region" aria-label={label} tabIndex={0}>{children}</div>
}

function DialogSurface({ title, children, onClose, className = '', initialFocusRef, returnFocusRef }: {
  title: string; children: ReactNode; onClose: () => void; className?: string
  initialFocusRef?: React.RefObject<HTMLElement | null>
  returnFocusRef?: React.RefObject<HTMLElement | null>
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const returnTarget = returnFocusRef?.current
    if (initialFocusRef?.current) initialFocusRef.current.focus()
    else closeRef.current?.focus()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('keydown', escape);
      (returnTarget ?? previouslyFocused)?.focus()
    }
  }, [initialFocusRef, returnFocusRef])
  const trapFocus = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  return <div ref={dialogRef} className={className} role="dialog" aria-modal="true"
    aria-labelledby={titleId} onKeyDown={trapFocus}>
    <div className="ui-dialog-heading"><h2 id={titleId}>{title}</h2>
      <Button ref={closeRef} variant="secondary" type="button" onClick={onClose} aria-label="Zatvori">×</Button></div>
    {children}
  </div>
}

export function Modal({ open, title, children, onClose, initialFocusRef }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void
  initialFocusRef?: React.RefObject<HTMLElement | null>
}) {
  if (!open) return null
  return <div className="ui-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <DialogSurface title={title} onClose={onClose} className="ui-dialog" initialFocusRef={initialFocusRef}>{children}</DialogSurface>
  </div>
}

export function Drawer({ open, title, children, onClose, returnFocusRef }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void
  returnFocusRef?: React.RefObject<HTMLElement | null>
}) {
  if (!open) return null
  return <div className="ui-overlay ui-overlay--drawer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <DialogSurface title={title} onClose={onClose} className="ui-drawer" returnFocusRef={returnFocusRef}>{children}</DialogSurface>
  </div>
}

interface Toast { id: number; message: string; tone: ToastTone }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  const notify = (message: string, tone: ToastTone = 'info') => {
    const id = ++nextId.current
    setToasts((current) => [...current, { id, message: message.slice(0, 300), tone }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000)
  }
  return <ToastContext.Provider value={notify}>{children}<div className="ui-toasts" aria-live="polite">
    {toasts.map((toast) => <div key={toast.id} className={`ui-toast ui-toast--${toast.tone}`}>{toast.message}
      <button aria-label="Zatvori obaveštenje" onClick={() => setToasts((current) => current.filter(({ id }) => id !== toast.id))}>×</button></div>)}
  </div></ToastContext.Provider>
}

export function Skeleton({ lines = 3, label = 'Učitavanje' }: { lines?: number; label?: string }) {
  return <div className="ui-skeleton" role="status" aria-label={label}>
    {Array.from({ length: lines }, (_, index) => <span key={index} />)}
  </div>
}

export function EmptyState({ title, description, action }: {
  title: string; description?: string; action?: ReactNode
}) {
  return <div className="ui-empty"><h2>{title}</h2>{description && <p>{description}</p>}{action}</div>
}

export function ErrorState({ title = 'Došlo je do greške', message, action }: {
  title?: string; message: string; action?: ReactNode
}) {
  return <div className="ui-error" role="alert"><h2>{title}</h2><p>{message}</p>{action}</div>
}

export function PageHeader({ eyebrow, title, actions, breadcrumbs }: {
  eyebrow?: string; title: string; actions?: ReactNode; breadcrumbs?: ReactNode
}) {
  return <header className="ui-page-header"><div>{breadcrumbs}{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1></div>{actions}</header>
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return <nav className="ui-breadcrumbs" aria-label="Putanja"><ol>{items.map((item, index) => <li key={item.label}>
    {item.href && index < items.length - 1 ? <a href={item.href}>{item.label}</a> : <span aria-current={index === items.length - 1 ? 'page' : undefined}>{item.label}</span>}
  </li>)}</ol></nav>
}
