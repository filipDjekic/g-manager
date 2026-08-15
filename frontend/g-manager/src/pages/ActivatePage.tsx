import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { authApi } from '../api/authApi'
import { apiErrorMessage } from '../api/client'
import { activationSchema } from '../auth/schemas'
import { Button, Card, ErrorState, FormField, Input } from '../components/ui'

type ActivationValues = z.infer<typeof activationSchema>

export function ActivatePage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const form = useForm<ActivationValues>({ resolver: zodResolver(activationSchema) })
  const submit = form.handleSubmit(async (values) => {
    setError('')
    try {
      await authApi.activate(values)
      navigate('/login', { replace: true, state: { activated: true } })
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Aktivacija trenutno nije dostupna.'))
    }
  })
  return <main className="auth-page"><Card className="auth-card">
    <form className="auth-form" onSubmit={submit} noValidate>
      <p className="eyebrow">G-Manager</p><h1>Aktivacija naloga</h1>
      <p>Unesite jednokratni kod koji ste dobili od zaposlenog i postavite svoju lozinku.</p>
      <FormField label="Aktivacioni kod" htmlFor="activation-secret"
        error={form.formState.errors.activationSecret?.message}>
        <Input id="activation-secret" autoComplete="one-time-code"
          {...form.register('activationSecret')} />
      </FormField>
      <FormField label="Nova lozinka" htmlFor="activation-password"
        error={form.formState.errors.password?.message}>
        <Input id="activation-password" type="password" autoComplete="new-password"
          {...form.register('password')} />
      </FormField>
      {error && <ErrorState title="Aktivacija nije uspela" message={error} />}
      <Button type="submit" loading={form.formState.isSubmitting}>Aktiviraj nalog</Button>
      <Link to="/login">Nazad na prijavu</Link>
    </form>
  </Card></main>
}
