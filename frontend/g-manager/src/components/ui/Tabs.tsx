import { useRef } from 'react'

export function Tabs({ items, value, onChange, label, idPrefix }: {
  items: Array<{ id: string; label: string }>; value: string; onChange: (id: string) => void
  label: string; idPrefix: string
}) {
  const list = useRef<HTMLDivElement>(null)
  return <div ref={list} className="ui-tabs" role="tablist" aria-label={label}>
    {items.map((item, index) => <button key={item.id} type="button" role="tab" id={`${idPrefix}-tab-${item.id}`}
      aria-selected={value === item.id} aria-controls={`${idPrefix}-panel-${item.id}`} tabIndex={value === item.id ? 0 : -1}
      onClick={() => onChange(item.id)} onKeyDown={(event) => {
        const next = event.key === 'ArrowRight' ? (index + 1) % items.length : event.key === 'ArrowLeft' ?
          (index + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1
        if (next < 0) return
        event.preventDefault(); onChange(items[next].id)
        list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
      }}>{item.label}</button>)}
  </div>
}
