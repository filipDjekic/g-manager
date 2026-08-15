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
import { Button, Card, ErrorState, FormField, Input } from '../components/ui'
import { featureApi } from '../api/featureApi'
import { useFeatureStore } from '../feature/featureStore'

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const user = useAuthStore((state) => state.user)
  const setSession = useAuthStore((state) => state.setSession)
  const [serverError, setServerError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  if (user) return <Navigate to="/" replace />

  const submit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      const response = await authApi.login(values)
      setSession(response.token, response.user)
      await featureApi.bootstrap().then(useFeatureStore.getState().apply)
        .catch(() => useFeatureStore.getState().reset())
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (error) {
      applyApiFieldErrors(error, form.setError, form.setFocus)
      setServerError(apiErrorMessage(error, 'Prijava trenutno nije dostupna.'))
    }
  })

  return <main className="auth-page">
    <Card className="auth-card"><form className="auth-form" onSubmit={submit} noValidate>
      <p className="eyebrow">G-Manager</p><h1>Prijava</h1>
      <FormField label="Email" htmlFor="login-email" error={form.formState.errors.email?.message}>
        <Input id="login-email" type="email" autoComplete="email"
          aria-invalid={!!form.formState.errors.email} {...form.register('email')} />
      </FormField>
      <FormField label="Lozinka" htmlFor="login-password" error={form.formState.errors.password?.message}>
        <Input id="login-password" type="password" autoComplete="current-password"
          aria-invalid={!!form.formState.errors.password} {...form.register('password')} />
      </FormField>
      {serverError && <ErrorState title="Prijava nije uspela" message={serverError} />}
      <Button type="submit" loading={form.formState.isSubmitting}>Prijavi se</Button>
      <p>Dobili ste aktivacioni kod? <Link to="/activate">Aktivirajte nalog</Link></p>
    </form></Card>
  </main>
}
