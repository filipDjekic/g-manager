import { Button } from './Button'
import { useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastTone } from './toastContext'
import './ui.css'

interface Toast { id: number; message: string; tone: ToastTone }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  const notify = (message: string, tone: ToastTone = 'info') => {
    const id = ++nextId.current
    setToasts((current) => [...current, { id, message: message.slice(0, 300), tone }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000)
  }
  return <ToastContext.Provider value={notify}>{children}<div className="ui-toasts" aria-live="polite">
    {toasts.map((toast) => <div key={toast.id} className={`ui-toast ui-toast--${toast.tone}`}>{toast.message}
      <Button iconOnly variant="ghost" aria-label="Zatvori obaveštenje" onClick={() => setToasts((current) => current.filter(({ id }) => id !== toast.id))}>×</Button></div>)}
  </div></ToastContext.Provider>
}
