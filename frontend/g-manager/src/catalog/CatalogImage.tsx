import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { catalogApi } from '../api/catalogApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import type { CatalogItem } from '../types/catalog.types'
import { CatalogIcon, catalogTypeLabel } from './CatalogPresentation'

export function CatalogImage({ item, eager = false }: { item: Pick<CatalogItem, 'type' | 'imageUrl'>; eager?: boolean }) {
  const user = useAuthStore(state => state.user)
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager)
  const [objectUrl, setObjectUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const documentId = /^\/api\/v1\/documents\/([\w-]+)\/content(?:\?|$)/.exec(item.imageUrl ?? '')?.[1]
  // Administrators can also see inactive images through the existing authenticated document policy.
  const authenticated = Boolean(documentId && hasCapability(user, 'CATALOG_MANAGE'))
  useEffect(() => {
    if (visible) return
    if (!('IntersectionObserver' in window)) { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '160px' })
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [visible])
  const content = useQuery({ queryKey: ['catalog-images', user?.id, documentId],
    queryFn: ({ signal }) => catalogApi.imageContent(documentId!, signal),
    enabled: authenticated && visible, staleTime: 60000, gcTime: 60000, retry: false })
  useEffect(() => {
    if (!content.data) return
    const source = URL.createObjectURL(content.data)
    setObjectUrl(source); setFailed(false)
    return () => URL.revokeObjectURL(source)
  }, [content.data])
  const source = authenticated ? objectUrl : item.imageUrl
  return <div ref={container} className="gm-catalog-image">
    {source && !failed && !content.error ? <img src={source} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async"
      width="640" height="360" onError={() => setFailed(true)} /> : <div className="gm-catalog-image-placeholder">
      <CatalogIcon type={item.type} /><span>{catalogTypeLabel(item.type)}</span>
      {(failed || content.error) && <small>Slika trenutno nije dostupna</small>}
    </div>}
  </div>
}
