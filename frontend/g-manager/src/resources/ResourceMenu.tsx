import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../components/ui'

export interface ResourceMenuAction {label:string;onClick:()=>void;disabled?:boolean}
export function ResourceMenu({label,children,actions,disabled=false}:{label:string;children:ReactNode;actions:ResourceMenuAction[];disabled?:boolean}) {
  const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),id=useId()
  const [position,setPosition]=useState({top:0,left:0})
  useLayoutEffect(()=>{
    if(!open||!trigger.current||!menu.current)return
    const anchor=trigger.current.getBoundingClientRect(),surface=menu.current.getBoundingClientRect()
    setPosition({top:anchor.bottom+surface.height+8<window.innerHeight?anchor.bottom+8:Math.max(8,anchor.top-surface.height-8),left:Math.max(8,Math.min(anchor.right-surface.width,window.innerWidth-surface.width-8))})
  },[open])
  useEffect(()=>{
    if(!open)return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))setOpen(false)}
    const scroll=(event:Event)=>{if(!menu.current?.contains(event.target as Node))setOpen(false)}
    const resize=()=>setOpen(false)
    document.addEventListener('pointerdown',outside)
    window.addEventListener('scroll',scroll,true);window.addEventListener('resize',resize)
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',resize)}
  },[open])
  const blur=(event:FocusEvent)=>{if(!root.current?.contains(event.relatedTarget as Node)&&!menu.current?.contains(event.relatedTarget as Node))setOpen(false)}
  const keyboard=(event:KeyboardEvent)=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus()}
    if(open&&event.key==='Tab'){setOpen(false);trigger.current?.focus()}
    if(!open&&event.key==='ArrowDown'){event.preventDefault();setOpen(true)}
    if(open&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault()
      const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')??[]),index=items.indexOf(document.activeElement as HTMLButtonElement)
      items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()
    }
  }
  return <div className="resource-menu" ref={root} onBlur={blur} onKeyDown={keyboard}>
    <Button ref={trigger} variant="secondary" disabled={disabled} aria-label={label} aria-haspopup="menu" aria-controls={open?id:undefined} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{children}</Button>
    {open&&createPortal(<div ref={menu} id={id} style={position} className="resource-menu-popover" role="menu" aria-label={label} onBlur={blur} onKeyDown={event=>{keyboard(event);event.stopPropagation()}}>{actions.map(action=><button type="button" role="menuitem" key={action.label} disabled={action.disabled} onClick={()=>{setOpen(false);trigger.current?.focus();action.onClick()}}>{action.label}</button>)}</div>,document.body)}
  </div>
}
