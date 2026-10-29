import { cloneElement, forwardRef, isValidElement, useEffect, useId, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import './ui.css'
export { ToastProvider } from './ToastProvider'

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

export const PageLayout = forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & { width?: 'full' | 'form' }>(
  function PageLayout({ children, className = '', width = 'full', ...props }, ref) {
    return <main ref={ref} className={`workspace ui-page-layout ui-page-layout--${width} ${className}`} {...props}>{children}</main>
  })

export const Card = forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & { padding?: 'standard' | 'none'; as?: 'section' | 'article' | 'div' }>(
  function Card({ children, className = '', padding = 'standard', as: Surface = 'section', ...props }, ref) {
    return <Surface ref={ref as Ref<HTMLDivElement>} className={`ui-card ui-card--${padding} ${className}`} {...props}>{children}</Surface>
  })

export function StatCard({ label, value, icon, description, tone = 'info', loading = false, children, onClick, to, ...props }: {
  label: ReactNode; value: ReactNode; icon?: ReactNode; description?: ReactNode; tone?: string
  loading?: boolean; children?: ReactNode; onClick?: () => void; to?: string
} & Omit<HTMLAttributes<HTMLElement>, 'onClick'>) {
  const content = <><div className="ui-stat-heading"><span>{label}</span>{icon && <span className="ui-stat-icon">{icon}</span>}</div>
    {loading ? <Skeleton lines={1} /> : <div className="ui-stat-value">{value}</div>}
    {description && <div className="ui-stat-description">{description}</div>}{children}</>
  const tones: Record<string, StatusTone> = { blue: 'info', pink: 'accent', purple: 'accent', green: 'success' }
  const className = `ui-card ui-stat ui-stat--${tones[tone] ?? tone} ${props.className ?? ''}`
  if (to) return <Link {...props as HTMLAttributes<HTMLAnchorElement>} to={to} className={className}>{content}</Link>
  return onClick ? <button {...props as HTMLAttributes<HTMLButtonElement>} type="button" className={className} onClick={onClick}>{content}</button>
    : <article {...props} className={className}>{content}</article>
}

export function TableShell({ label, children, className = '', ...props }: { label: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ui-table-shell ${className}`} role="region" aria-label={label} tabIndex={0}>{children}</div>
}

export function Alert({ children, tone = 'info', className = '', ...props }: {
  children: ReactNode; tone?: Exclude<StatusTone, 'accent' | 'neutral'>
} & HTMLAttributes<HTMLDivElement>) {
  return <div role={tone === 'danger' ? 'alert' : 'status'} {...props} className={`ui-alert ui-alert--${tone} ${className}`}>{children}</div>
}

export function Pagination({ page, totalPages = 1, onPageChange, loading = false, numbered = false,
  totalElements, pageSize = 10, onPageSizeChange, pageSizes = [10, 20, 50, 100], label = 'Stranice rezultata', disabled = false }: {
  page: number; totalPages?: number; onPageChange: (page: number) => void; loading?: boolean
  numbered?: boolean; totalElements?: number; pageSize?: number; label?: string; disabled?: boolean
  onPageSizeChange?: (size: number) => void; pageSizes?: readonly number[]
}) {
  const pages = Math.max(1, Number.isFinite(totalPages) ? Math.floor(totalPages) : 1)
  const current = Math.max(0, Math.min(Number.isSafeInteger(page) ? page : 0, pages - 1))
  const busy = loading || disabled
  useEffect(() => {
    if (!busy && current !== page) onPageChange(current)
  }, [busy, current, page, onPageChange])
  const start = Math.max(0, Math.min(current - 1, pages - 3))
  const visible = [...new Set([0, ...Array.from({ length: Math.min(3, pages) }, (_, index) => start + index), pages - 1])].sort((a, b) => a - b)
  return <div className="ui-pagination" aria-busy={loading || undefined}>
    <div className="ui-pagination-summary"><span aria-live="polite">{totalElements !== undefined && <>Prikazano {totalElements ? Math.min(current * pageSize + 1, totalElements) : 0}–{Math.min((current + 1) * pageSize, totalElements)} od {totalElements} rezultata · </>}Stranica {current + 1} od {pages}</span>
      {onPageSizeChange && <label>Po stranici<Select aria-label={"Po stranici"} value={pageSize} disabled={busy} onChange={event => onPageSizeChange(Number(event.target.value))}>
        {[...new Set([...pageSizes, pageSize])].sort((a, b) => a - b).map(size => <option key={size} value={size}>{size}</option>)}
      </Select></label>}
    </div>
    <nav className="ui-pagination-controls" aria-label={label}>
      <Button variant="secondary" disabled={busy || current === 0} onClick={() => onPageChange(current - 1)}>Prethodna</Button>
      {numbered && visible.map((number, index) => <span className="ui-pagination-page" key={number}>
        {index > 0 && number - visible[index - 1] > 1 && <span aria-hidden="true">…</span>}
        <Button variant="secondary" disabled={busy} aria-current={current === number ? 'page' : undefined}
          aria-label={`Stranica ${number + 1}`} onClick={() => onPageChange(number)}>{number + 1}</Button>
      </span>)}
      <Button variant="secondary" disabled={busy || current + 1 >= pages} onClick={() => onPageChange(current + 1)}>Sledeća</Button>
    </nav>
  </div>
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
      .sort((first, second) => (first.tabIndex || Infinity) - (second.tabIndex || Infinity)
        || (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
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
      <Button ref={closeRef} disabled={closeDisabled} variant="ghost" iconOnly type="button" onClick={onClose} aria-label="Zatvori">×</Button></div>
    <div className="ui-dialog-body">{children}</div>
    {footer && <div className="ui-dialog-footer">{footer}</div>}
  </div>
}

export function Modal({ open, title, children, onClose, initialFocusRef, returnFocusRef,
  closeDisabled = false, descriptionId, footer, className = '', titleIcon, size = 'standard' }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void
  initialFocusRef?: React.RefObject<HTMLElement | null>
  returnFocusRef?: React.RefObject<HTMLElement | null>
  closeDisabled?: boolean; descriptionId?: string; footer?: ReactNode; className?: string; titleIcon?: ReactNode; size?: 'small' | 'standard' | 'wide'
}) {
  if (!open) return null
  // Keep fixed positioning relative to the viewport, outside filtered layout containers.
  return createPortal(<div className="ui-overlay" onMouseDown={(event) => {
    if (event.target === event.currentTarget) { event.preventDefault(); if (!closeDisabled) onClose() }
  }}>
    <DialogSurface title={title} onClose={onClose} className={`ui-dialog ui-dialog--${size} ${className}`} closeDisabled={closeDisabled}
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

export function PageHeader({ eyebrow, title, description, icon, titleRef, actions, breadcrumbs, children }: {
  eyebrow?: string; title: string; description?: ReactNode; icon?: ReactNode; titleRef?: Ref<HTMLHeadingElement>
  actions?: ReactNode; breadcrumbs?: ReactNode; children?: ReactNode
}) {
  return <header className="ui-page-header"><div className="ui-page-heading">
    {icon && <span className="ui-page-icon" aria-hidden="true">{icon}</span>}
    <div className="ui-page-title">{breadcrumbs}{eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</h1>
      {description && <p className="ui-page-description">{description}</p>}{children}</div>
    </div>{actions && <div className="ui-page-actions">{actions}</div>}</header>
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return <nav className="ui-breadcrumbs" aria-label="Putanja"><ol>{items.map((item, index) => <li key={item.label}>
    {item.href && index < items.length - 1 ? <a href={item.href}>{item.label}</a> : <span aria-current={index === items.length - 1 ? 'page' : undefined}>{item.label}</span>}
  </li>)}</ol></nav>
}
