import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { authApi } from '../api/authApi'
import { apiErrorMessage } from '../api/client'
import { loginSchema } from '../auth/schemas'
import { useAuthStore } from '../auth/authStore'
import { applyApiFieldErrors } from '../common/applyApiFieldErrors'
import { Button, ErrorState } from '../components/ui'
import { featureApi } from '../api/featureApi'
import { useFeatureStore } from '../feature/featureStore'
import { homeForUser } from '../layout/navigation'
import { AuthLayout } from '../layout/AuthLayout'
import { AuthField } from '../layout/AuthField'

type LoginValues = z.infer<typeof loginSchema>
type LoginLocationState = { from?: string; activated?: boolean }

export function LoginPage() {
  const user = useAuthStore((state) => state.user)
  const flags = useFeatureStore((state) => state.flags)
  const setSession = useAuthStore((state) => state.setSession)
  const [serverError, setServerError] = useState<string | null>(null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const [activationSuccess] = useState(
    () => (location.state as LoginLocationState | null)?.activated === true,
  )
  const submitting = useRef(false)
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  useEffect(() => {
    if (user) return
    const state = location.state as LoginLocationState | null
    if (state?.activated === true) {
      const nextState = { ...state }
      delete nextState.activated
      navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
        replace: true,
        state: Object.keys(nextState).length ? nextState : null,
        preventScrollReset: true,
      })
    }
  }, [location, navigate, user])

  if (user && !form.formState.isSubmitting) return <Navigate to={homeForUser(user, flags)} replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    try {
      await form.handleSubmit(async (values) => {
        setServerError(null)
        try {
          const response = await authApi.login(values)
          setSession(response.token, response.user)
          await featureApi.bootstrap().then(useFeatureStore.getState().apply)
            .catch(() => useFeatureStore.getState().reset())
          const from = (location.state as LoginLocationState | null)?.from
          navigate(from && from !== '/login' && from !== '/' ? from : homeForUser(response.user, useFeatureStore.getState().flags), { replace: true })
        } catch (error) {
          applyApiFieldErrors(error, form.setError, form.setFocus)
          setServerError(apiErrorMessage(error, 'Prijava trenutno nije dostupna.'))
        }
      })(event)
    } finally {
      submitting.current = false
    }
  }

  return <AuthLayout>
    <form className="gm-auth-form" onSubmit={submit} noValidate aria-labelledby="login-title">
      <h1 id="login-title">Prijava</h1>
      {activationSuccess && <p className="gm-auth-success" role="status">
        Nalog je uspešno aktiviran. Sada se možete prijaviti.
      </p>}
      <AuthField id="login-email" label="Email adresa" icon="email" type="email" required
        autoComplete="email" autoCapitalize="none" spellCheck={false}
        readOnly={form.formState.isSubmitting} error={form.formState.errors.email?.message}
        {...form.register('email')} />
      <AuthField id="login-password" label="Lozinka" icon="lock" required
        autoComplete="current-password" autoCapitalize="none" spellCheck={false}
        readOnly={form.formState.isSubmitting} error={form.formState.errors.password?.message}
        passwordToggle={{
          visible: passwordVisible,
          label: passwordVisible ? 'Sakrij lozinku' : 'Prikaži lozinku',
          onToggle: () => setPasswordVisible((visible) => !visible),
          disabled: form.formState.isSubmitting,
        }}
        {...form.register('password')} />
      {serverError && <ErrorState title="Prijava nije uspela" message={serverError} />}
      <Button className="gm-auth-submit" type="submit" loading={form.formState.isSubmitting}>Prijavi se</Button>
      <p className="gm-auth-activation">Dobili ste aktivacioni kod? <Link to="/activate">Aktivirajte nalog</Link></p>
    </form>
  </AuthLayout>
}
