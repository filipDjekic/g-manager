import { useLayoutEffect, useRef, useState } from 'react'

export function useContentWidth(minimumRem = 68, enabled = true) {
  const ref = useRef<HTMLElement>(null), [wide, setWide] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !enabled) return
    const measure = () => {
      const style = getComputedStyle(element)
      const width = element.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')
      setWide(width >= minimumRem * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [minimumRem, enabled])
  return { ref, wide }
}
