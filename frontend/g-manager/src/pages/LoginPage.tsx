import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { authApi } from '../api/authApi'
import { apiErrorMessage } from '../api/client'
import { loginSchema } from '../auth/schemas'
import { useAuthStore } from '../auth/authStore'
import { applyApiFieldErrors } from '../common/applyApiFieldErrors'
import { Button, ErrorState, Input } from '../components/ui'
import { featureApi } from '../api/featureApi'
import { useFeatureStore } from '../feature/featureStore'
import { homeForUser } from '../layout/navigation'
import { AuthLayout } from '../layout/AuthLayout'

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const user = useAuthStore((state) => state.user)
  const flags = useFeatureStore((state) => state.flags)
  const setSession = useAuthStore((state) => state.setSession)
  const [serverError, setServerError] = useState<string | null>(null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  if (user && !form.formState.isSubmitting) return <Navigate to={homeForUser(user, flags)} replace />

  const submit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      const response = await authApi.login(values)
      setSession(response.token, response.user)
      await featureApi.bootstrap().then(useFeatureStore.getState().apply)
        .catch(() => useFeatureStore.getState().reset())
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' && from !== '/' ? from : homeForUser(response.user, useFeatureStore.getState().flags), { replace: true })
    } catch (error) {
      applyApiFieldErrors(error, form.setError, form.setFocus)
      setServerError(apiErrorMessage(error, 'Prijava trenutno nije dostupna.'))
    }
  })

  return <AuthLayout>
    <form className="gm-auth-form" onSubmit={submit} noValidate aria-labelledby="login-title">
      <h1 id="login-title">Prijava</h1>
      <div className="gm-auth-field">
        <label htmlFor="login-email">Email adresa</label>
        <div className="gm-auth-control">
          <svg className="gm-auth-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          <Input id="login-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            aria-invalid={!!form.formState.errors.email}
            aria-describedby={form.formState.errors.email ? 'login-email-error' : undefined}
            {...form.register('email')} />
        </div>
        {form.formState.errors.email && <span id="login-email-error" className="field-error" role="alert">
          {form.formState.errors.email.message}
        </span>}
      </div>
      <div className="gm-auth-field">
        <label htmlFor="login-password">Lozinka</label>
        <div className="gm-auth-control gm-auth-control--password">
          <svg className="gm-auth-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
          </svg>
          <Input id="login-password" type={passwordVisible ? 'text' : 'password'} autoComplete="current-password"
            aria-invalid={!!form.formState.errors.password}
            aria-describedby={form.formState.errors.password ? 'login-password-error' : undefined}
            {...form.register('password')} />
          <button className="gm-auth-password-toggle" type="button" aria-controls="login-password"
            aria-label={passwordVisible ? 'Sakrij lozinku' : 'Prikaži lozinku'}
            onClick={() => setPasswordVisible((visible) => !visible)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {passwordVisible && <path d="m3 3 18 18" />}
            </svg>
          </button>
        </div>
        {form.formState.errors.password && <span id="login-password-error" className="field-error" role="alert">
          {form.formState.errors.password.message}
        </span>}
      </div>
      {serverError && <ErrorState title="Prijava nije uspela" message={serverError} />}
      <Button className="gm-auth-submit" type="submit" loading={form.formState.isSubmitting}>Prijavi se</Button>
      <p className="gm-auth-activation">Dobili ste aktivacioni kod? <Link to="/activate">Aktivirajte nalog</Link></p>
    </form>
  </AuthLayout>
}
