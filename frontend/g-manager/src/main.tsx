import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AppErrorBoundary } from './common/AppErrorBoundary'
import './index.css'
import { installGlobalErrorReporting } from './observability/errorReporter'
import { installWebVitalsReporting } from './observability/performanceReporter'
import { UiPreferencesProvider } from './preferences/UiPreferences'
import { ToastProvider } from './components/ui/ToastProvider'
import { registerPwa } from './pwa/pwa'
import { installSessionCacheBoundary } from './query/sessionCacheBoundary'

installGlobalErrorReporting()
installWebVitalsReporting()
registerPwa()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})
const removeSessionBoundary = installSessionCacheBoundary(queryClient)
if (import.meta.hot) import.meta.hot.dispose(removeSessionBoundary)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <UiPreferencesProvider>
        <ToastProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </ToastProvider>
      </UiPreferencesProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
