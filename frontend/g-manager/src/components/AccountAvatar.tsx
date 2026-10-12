import { useEffect, useRef, useState } from 'react'
import type { AuthUser } from '../types/auth.types'
import './accountAvatar.css'

export type AvatarStatus = 'empty' | 'loading' | 'ready' | 'error'
type AvatarUser = Pick<AuthUser, 'id' | 'name' | 'avatarUrl'>
export function accountInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return [parts[0]?.[0], parts.length > 1 ? parts.at(-1)?.[0] : ''].join('').toLocaleUpperCase('sr-Latn-RS') || '?'
}

export function AccountAvatar({ user, reload = 0, onStatus }: { user: AvatarUser | null | undefined; reload?: number; onStatus?: (status: AvatarStatus) => void }) {
  return <AvatarImage key={user?.id ?? 'anonymous'} user={user} reload={reload} onStatus={onStatus} />
}

function AvatarImage({ user, reload, onStatus }: { user: AvatarUser | null | undefined; reload: number; onStatus?: (status: AvatarStatus) => void }) {
  const url = user?.avatarUrl || '', request = `${url}:${reload}`
  const [approved, setApproved] = useState<{ url: string; source: string } | null>(null)
  const [progress, setProgress] = useState<{ request: string; attempt: number; status: AvatarStatus }>({ request, attempt: 0, status: url ? 'loading' : 'empty' })
  const timer = useRef<number | undefined>(undefined), currentRequest = useRef(request)
  currentRequest.current = request
  const attempt = progress.request === request ? progress.attempt : 0
  const status = !url ? 'empty' : approved?.url === url ? 'ready' : progress.request === request ? progress.status : 'loading'
  useEffect(() => {
    setProgress({ request, attempt: 0, status: url ? 'loading' : 'empty' })
    return () => window.clearTimeout(timer.current)
  }, [request, url])
  useEffect(() => { onStatus?.(status) }, [status, onStatus])
  const loaded = url ? approved : null
  // Native image requests preserve the existing preview URL and server scan gate.
  const source = url && (attempt > 0 || reload > 0) ? `${url}${url.includes('?') ? '&' : '?'}avatarRetry=${attempt + reload}` : url
  const images = [...(loaded ? [{ ...loaded, pending: false }] : []),
    ...(url && loaded?.url !== url && status !== 'error' ? [{ url, source, pending: true }] : [])]
  return <span className="gm-account-avatar-content" aria-hidden="true">
    {!loaded && <span>{accountInitials(user?.name ?? '')}</span>}
    {images.map(image => <img key={image.source} src={image.source} alt="" decoding="async"
      className={`gm-account-avatar-image${image.pending ? ' is-pending' : ''}`}
      onLoad={() => {
        if (!image.pending || currentRequest.current !== request) return
        window.clearTimeout(timer.current)
        setApproved({ url: image.url, source: image.source }); setProgress({ request, attempt, status: 'ready' })
      }} onError={() => {
        if (!image.pending || currentRequest.current !== request) return
        window.clearTimeout(timer.current)
        if (attempt < 5) timer.current = window.setTimeout(() => {
          if (currentRequest.current === request) setProgress({ request, attempt: attempt + 1, status: 'loading' })
        }, 2000)
        else setProgress({ request, attempt, status: 'error' })
      }} />)}
  </span>
}
