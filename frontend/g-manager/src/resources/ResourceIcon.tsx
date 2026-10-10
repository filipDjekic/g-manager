import type { ResourceType } from '../types/resource.types'
import type { SVGProps } from 'react'

export function ResourceIcon({type,className='',...props}:{type?:ResourceType} & Omit<SVGProps<SVGSVGElement>,'type'>) {
  return <svg {...props} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {type==='GAMING_PC'?<><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5m-5 0h10M6 12h12"/></>:type==='PLAYSTATION'?<><path d="M8 7h8c3 0 4 2 5 7s-1 7-4 4l-2-2H9l-2 2c-3 3-5 1-4-4s2-7 5-7Z"/><path d="M7 10v4m-2-2h4m7-1h.01m2 2h.01"/></>:type==='SIMULATOR'?<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="m4 8 6 3m4 0 6-3m-8 6v7"/></>:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 11h8V3m0 18v-5h10"/></>}
  </svg>
}
