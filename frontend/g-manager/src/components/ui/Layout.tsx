import { forwardRef, type HTMLAttributes, type ReactNode, type Ref } from 'react'

export const PageLayout = forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & { width?: 'full' | 'form' }>(
  function PageLayout({ children, className = '', width = 'full', ...props }, ref) {
    return <main ref={ref} className={`workspace ui-page-layout ui-page-layout--${width} ${className}`} {...props}>{children}</main>
  })

export const Card = forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & { padding?: 'standard' | 'none'; as?: 'section' | 'article' | 'div' }>(
  function Card({ children, className = '', padding = 'standard', as: Surface = 'section', ...props }, ref) {
    return <Surface ref={ref as Ref<HTMLDivElement>} className={`ui-card ui-card--${padding} ${className}`} {...props}>{children}</Surface>
  })

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
