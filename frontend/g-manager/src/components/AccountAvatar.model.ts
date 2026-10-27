
import type { AuthUser } from '../types/auth.types'
import './accountAvatar.css'
export type AvatarStatus = 'empty' | 'loading' | 'ready' | 'error'
export type AvatarUser = Pick<AuthUser, 'id' | 'name' | 'avatarUrl'>
export function accountInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return [parts[0]?.[0], parts.length > 1 ? parts.at(-1)?.[0] : ''].join('').toLocaleUpperCase('sr-Latn-RS') || '?'
}
