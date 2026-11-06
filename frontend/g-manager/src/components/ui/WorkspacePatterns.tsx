import type { ReactNode, RefObject } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from './Button'
import { ActionMenu } from './ActionMenu'
import { Drawer } from './Dialogs'
import { formatBusinessTime } from '../../reservations/dateTime'
import { useContentWidth } from './useContentWidth'

export function SegmentedControl<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string; count?: number }[]; onChange: (value: T) => void
}) {
  return <div className="ui-segmented" role="group" aria-label={label}>{options.map(option =>
    <Button key={option.value} variant="ghost" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      {option.label}{option.count !== undefined && <span className="ui-count">{option.count}</span>}
    </Button>)}</div>
}

export function AdvancedFilters({ children, active = false, label = 'Više filtera' }: {
  children: ReactNode; active?: boolean; label?: string
}) {
  return <details className="ui-advanced-filters" open={active || undefined}>
    <summary>{label}{active && <span className="ui-count">Aktivni</span>}</summary><div>{children}</div>
  </details>
}

export function ListToolbar({ children, search, actions }: { children?: ReactNode; search?: ReactNode; actions?: ReactNode }) {
  return <div className="ui-list-toolbar"><div className="ui-list-toolbar-main">{search}{children}</div>{actions && <div className="ui-actions">{actions}</div>}</div>
}

export function MetricStrip({ children, label = 'Sažeti pregled' }: { children: ReactNode; label?: string }) {
  return <section className="ui-metric-strip" aria-label={label}>{children}</section>
}

export interface ViewNavigationItem {
  label: string; to: string; active?: boolean; children?: { label: string; to: string; active?: boolean }[]
}

function ChevronDown() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" /></svg>
}

export function ViewNavigation({ label, items }: { label: string; items: ViewNavigationItem[] }) {
  const navigate = useNavigate(), { pathname } = useLocation()
  return <nav className="ui-view-navigation" aria-label={label}>{items.map(item => item.children?.length
    ? <ActionMenu key={`${pathname}:${item.to}`} label={item.label} compact={false} placement="bottom-start"
      className={`ui-view-navigation-menu-trigger${item.active ? ' is-active' : ''}`} menuClassName="ui-view-navigation-menu"
      actions={item.children.map(child => ({ label: child.label, onClick: () => { void navigate(child.to) } }))}>
      {item.label}<ChevronDown />
    </ActionMenu>
    : <Link key={item.to} to={item.to} aria-current={item.active ? 'page' : undefined}>{item.label}</Link>)}</nav>
}

export function FreshnessStatus({ time, error, connected, paused, stale }: {
  time?: string; error?: boolean; connected?: boolean; paused?: boolean; stale?: boolean
}) {
  return <div className="ui-freshness" role="status" data-stale={error || stale || undefined} data-paused={paused || undefined}>
    <span>{error || stale ? 'Podaci mogu biti zastareli' : paused ? 'Osvežavanje pauzirano' : connected ? 'Veza uživo' : 'Periodično osvežavanje'}</span>
    {time && <time dateTime={time}>Poslednja potvrda {formatBusinessTime(time)}</time>}
  </div>
}

export function MasterDetailLayout({ children, detail, title, open, onClose, inline, className = '', panelClassName = '', drawerClassName = '', returnFocusRef, panelRef, closeDisabled = false }: {
  children: ReactNode; detail: ReactNode; title: string; open: boolean; onClose: () => void; inline?: boolean
  className?: string; panelClassName?: string; drawerClassName?: string; returnFocusRef?: RefObject<HTMLElement | null>; panelRef?: RefObject<HTMLElement | null>; closeDisabled?: boolean
}) {
  const { ref, wide: measured } = useContentWidth(68, inline === undefined), wide = inline ?? measured
  return <section ref={ref} className={'ui-master-detail ' + className + (wide && open ? ' has-detail' : '')}>
    <div>{children}</div>{wide && open && <aside ref={panelRef} tabIndex={-1} aria-label={title} className={panelClassName}>{detail}</aside>}
    <Drawer open={open && !wide} title={title} onClose={onClose} size="wide" className={drawerClassName} returnFocusRef={returnFocusRef} closeDisabled={closeDisabled}>{!wide && detail}</Drawer>
  </section>
}
