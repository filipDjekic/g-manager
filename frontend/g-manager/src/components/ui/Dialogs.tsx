import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

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
        if ((event.target as HTMLElement).closest('[role="menu"]')) return
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

export function Drawer({ open, title, children, onClose, returnFocusRef, size = 'standard', closeDisabled = false, className = '', titleIcon }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void
  returnFocusRef?: React.RefObject<HTMLElement | null>
  size?: 'standard' | 'wide'
  closeDisabled?: boolean
  className?: string
  titleIcon?: ReactNode
}) {
  if (!open) return null
  return createPortal(<div className="ui-overlay ui-overlay--drawer" onMouseDown={(event) => {
    if (event.target === event.currentTarget) { event.preventDefault(); if (!closeDisabled) onClose() }
  }}>
    <DialogSurface title={title} titleIcon={titleIcon} onClose={onClose} closeDisabled={closeDisabled} className={`ui-drawer${size === 'wide' ? ' ui-drawer--wide' : ''} ${className}`} returnFocusRef={returnFocusRef}>{children}</DialogSurface>
  </div>, document.body)
}

