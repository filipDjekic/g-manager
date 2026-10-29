import type { ReactNode } from 'react'
import { ActionMenu } from '../components/ui'
export interface ResourceMenuAction {label:string;onClick:()=>void;disabled?:boolean}
export function ResourceMenu({label,children,actions,disabled=false}:{label:string;children:ReactNode;actions:ResourceMenuAction[];disabled?:boolean}) {
  return <ActionMenu label={label} actions={actions} disabled={disabled} compact={false}>{children}</ActionMenu>
}
