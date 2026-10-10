import { useId } from 'react'

export function BrandLogo({ className }: { className?: string }) {
  const gradientId = useId()

  return <svg className={className} viewBox="0 0 168 168" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--color-primary)" />
        <stop offset="100%" stopColor="var(--color-secondary)" />
      </linearGradient>
    </defs>
    <path fill={`url(#${gradientId})`}
      d="M148 42 118 16H50L16 50v68l34 34h68l34-34V82H86v28h36v6l-16 16H62l-18-18V62l18-18h44l22 20Z" />
  </svg>
}
