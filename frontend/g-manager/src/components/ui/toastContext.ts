import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'
export const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => undefined)
export const useToast = () => useContext(ToastContext)
