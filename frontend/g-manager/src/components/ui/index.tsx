import {
  cloneElement, forwardRef, isValidElement, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
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
    ? cloneElement(children, { 'aria-describedby': descriptionIds, 'aria-invalid': Boolean(error) || undefined })
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

export function Pagination({ page, totalPages = 1, onPageChange, loading = false, numbered = false,
  totalElements = 0, pageSize = 10 }: {
  page: number; totalPages?: number; onPageChange: (page: number) => void; loading?: boolean
  numbered?: boolean; totalElements?: number; pageSize?: number
}) {
  const pages = Math.max(totalPages, 1)
  if (numbered) {
    const start = Math.max(0, Math.min(page - 2, pages - 5))
    const visible = [...new Set([0, ...Array.from({ length: Math.min(5, pages) }, (_, index) => start + index), pages - 1])]
      .sort((first, second) => first - second)
    return <div className="pagination-numbered">
      <span className="pagination-result-count" aria-live="polite">Prikazano {totalElements ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, totalElements)} od {totalElements} rezervacija</span>
      <nav className="pagination" aria-label="Stranice rezervacija">
        <Button type="button" variant="secondary" disabled={loading || page <= 0} onClick={() => onPageChange(page - 1)}>Prethodna</Button>
        {visible.map((number, index) => <span className="pagination-page" key={number}>
          {index > 0 && number - visible[index - 1] > 1 && <span aria-hidden="true">…</span>}
          <Button type="button" variant="secondary" disabled={loading} aria-label={`Stranica ${number + 1}`}
            aria-current={page === number ? 'page' : undefined} onClick={() => onPageChange(number)}>{number + 1}</Button>
        </span>)}
        <Button type="button" variant="secondary" disabled={loading || page + 1 >= pages} onClick={() => onPageChange(page + 1)}>Sledeća</Button>
      </nav>
    </div>
  }
  return <nav className="pagination" aria-label="Stranice rezultata">
    <Button type="button" variant="secondary" disabled={loading || page <= 0} onClick={() => onPageChange(page - 1)}>Prethodna</Button>
    <span aria-live="polite">Strana {page + 1} od {pages}</span>
    <Button type="button" variant="secondary" disabled={loading || page + 1 >= pages} onClick={() => onPageChange(page + 1)}>Sledeća</Button>
  </nav>
}

const dialogStack: HTMLElement[] = []
const backgroundState = new Map<HTMLElement, boolean>()
let savedBodyStyle: { overflow: string; paddingRight: string } | undefined

function synchronizeDialogs() {
  const active = dialogStack.at(-1)
  for (const element of Array.from(document.body.children)) {
    if (!(element instanceof HTMLElement)) continue
    if (active) {
      if (!backgroundState.has(element)) backgroundState.set(element, element.inert)
      element.inert = !element.contains(active) && !element.classList.contains('ui-toasts')
    } else if (backgroundState.has(element)) element.inert = backgroundState.get(element)!
  }
  if (!active) { backgroundState.clear(); return }
  dialogStack.forEach((surface, index) => {
    const overlay = surface.closest<HTMLElement>('.ui-overlay')
    if (overlay) overlay.style.zIndex = String(100 + index * 2)
  })
}

function DialogSurface({ title, children, onClose, className = '', initialFocusRef, returnFocusRef,
  closeDisabled = false, descriptionId, footer, titleIcon }: {
  title: string; children: ReactNode; onClose: () => void; className?: string
  initialFocusRef?: React.RefObject<HTMLElement | null>
  returnFocusRef?: React.RefObject<HTMLElement | null>
  closeDisabled?: boolean; descriptionId?: string; footer?: ReactNode; titleIcon?: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const closeDisabledRef = useRef(closeDisabled)
  const titleId = useId()
  useEffect(() => { onCloseRef.current = onClose; closeDisabledRef.current = closeDisabled }, [onClose, closeDisabled])
  useEffect(() => {
    const surface = dialogRef.current!
    const previouslyFocused = document.activeElement as HTMLElement | null
    const returnTarget = returnFocusRef?.current
    if (!dialogStack.length) {
      savedBodyStyle = { overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight }
      const scrollbar = window.innerWidth - document.documentElement.clientWidth
      if (scrollbar > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`
      document.body.style.overflow = 'hidden'
    }
    dialogStack.push(surface)
    synchronizeDialogs()
    const focusable = () => Array.from(surface.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[hidden], [inert]') && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== 'hidden')
    const requestedFocus = initialFocusRef?.current ?? closeRef.current
    const initialFocus = requestedFocus && !requestedFocus.matches(':disabled') && !requestedFocus.closest('[inert]')
      ? requestedFocus : focusable()[0] ?? surface
    initialFocus.focus({ preventScroll: true })
    const keyboard = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== surface) return
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation()
        if (!closeDisabledRef.current) onCloseRef.current()
      }
      if (event.key !== 'Tab') return
      const items = focusable(), first = items[0], last = items.at(-1)
      if (!first) { event.preventDefault(); surface.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement as HTMLElement))) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement as HTMLElement))) {
        event.preventDefault(); first.focus()
      }
    }
    const containFocus = (event: FocusEvent) => {
      if (dialogStack.at(-1) === surface && !surface.contains(event.target as Node)) (focusable()[0] ?? surface).focus()
    }
    document.addEventListener('keydown', keyboard, true)
    document.addEventListener('focusin', containFocus)
    return () => {
      document.removeEventListener('keydown', keyboard, true)
      document.removeEventListener('focusin', containFocus)
      const index = dialogStack.indexOf(surface)
      if (index >= 0) dialogStack.splice(index, 1)
      synchronizeDialogs()
      if (!dialogStack.length && savedBodyStyle) {
        Object.assign(document.body.style, savedBodyStyle); savedBodyStyle = undefined
      }
      const target = returnTarget ?? previouslyFocused
      if (target?.isConnected && !target.closest('[inert]')) target.focus({ preventScroll: true })
      else dialogStack.at(-1)?.focus({ preventScroll: true })
    }
  }, [initialFocusRef, returnFocusRef])
  return <div ref={dialogRef} tabIndex={-1} className={className} role="dialog" aria-modal="true"
    aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={closeDisabled || undefined}>
    <div className="ui-dialog-heading"><h2 id={titleId}>{titleIcon}{title}</h2>
      <Button ref={closeRef} disabled={closeDisabled} variant="secondary" type="button" onClick={onClose} aria-label="Zatvori">×</Button></div>
    <div className="ui-dialog-body">{children}</div>
    {footer && <div className="ui-dialog-footer">{footer}</div>}
  </div>
}

export function Modal({ open, title, children, onClose, initialFocusRef, returnFocusRef,
  closeDisabled = false, descriptionId, footer, className = '', titleIcon }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void
  initialFocusRef?: React.RefObject<HTMLElement | null>
  returnFocusRef?: React.RefObject<HTMLElement | null>
  closeDisabled?: boolean; descriptionId?: string; footer?: ReactNode; className?: string; titleIcon?: ReactNode
}) {
  if (!open) return null
  // Keep fixed positioning relative to the viewport, outside filtered layout containers.
  return createPortal(<div className="ui-overlay" onMouseDown={(event) => {
    if (event.target === event.currentTarget) { event.preventDefault(); if (!closeDisabled) onClose() }
  }}>
    <DialogSurface title={title} onClose={onClose} className={`ui-dialog ${className}`} closeDisabled={closeDisabled}
      descriptionId={descriptionId} footer={footer} titleIcon={titleIcon} initialFocusRef={initialFocusRef} returnFocusRef={returnFocusRef}>{children}</DialogSurface>
  </div>, document.body)
}

export function Drawer({ open, title, children, onClose, returnFocusRef, size = 'standard', closeDisabled = false, className = '' }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void
  returnFocusRef?: React.RefObject<HTMLElement | null>
  size?: 'standard' | 'wide'
  closeDisabled?: boolean
  className?: string
}) {
  if (!open) return null
  return createPortal(<div className="ui-overlay ui-overlay--drawer" onMouseDown={(event) => {
    if (event.target === event.currentTarget) { event.preventDefault(); if (!closeDisabled) onClose() }
  }}>
    <DialogSurface title={title} onClose={onClose} closeDisabled={closeDisabled} className={`ui-drawer${size === 'wide' ? ' ui-drawer--wide' : ''} ${className}`} returnFocusRef={returnFocusRef}>{children}</DialogSurface>
  </div>, document.body)
}

export type StatusTone = 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'danger'
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>
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
