import { useEffect, useState } from 'react'

export function useObjectUrl(blob?: Blob | null) {
  const [resource, setResource] = useState<{ blob: Blob; url: string }>()
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    // The URL is a browser-owned resource; create after commit and release it on replacement/unmount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResource({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return resource?.blob === blob ? resource?.url ?? '' : ''
}
