import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { authApi } from '../api/authApi'
import { apiErrorMessage } from '../api/client'
import { registerSchema } from '../auth/schemas'
import { applyApiFieldErrors } from '../common/applyApiFieldErrors'
import { Button, Card, ErrorState, FormField, Input } from '../components/ui'

type RegisterValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const navigate = useNavigate()
  const form = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })
  const submit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      await authApi.register(values)
      navigate('/login', { replace: true, state: { registered: true } })
    } catch (error) {
      applyApiFieldErrors(error, form.setError, form.setFocus)
      setServerError(apiErrorMessage(error, 'Registracija trenutno nije dostupna.'))
    }
  })

  return <main className="auth-page"><Card className="auth-card">
    <form className="auth-form" onSubmit={submit} noValidate>
      <p className="eyebrow">Novi nalog</p><h1>Registracija</h1>
      <FormField label="Ime" htmlFor="register-name" error={form.formState.errors.name?.message}>
        <Input id="register-name" autoComplete="name" aria-invalid={!!form.formState.errors.name} {...form.register('name')} />
      </FormField>
      <FormField label="Email" htmlFor="register-email" error={form.formState.errors.email?.message}>
        <Input id="register-email" type="email" autoComplete="email" aria-invalid={!!form.formState.errors.email} {...form.register('email')} />
      </FormField>
      <FormField label="Lozinka" htmlFor="register-password" error={form.formState.errors.password?.message}>
        <Input id="register-password" type="password" autoComplete="new-password" aria-invalid={!!form.formState.errors.password} {...form.register('password')} />
      </FormField>
      {serverError && <ErrorState title="Registracija nije uspela" message={serverError} />}
      <Button type="submit" loading={form.formState.isSubmitting}>Kreiraj CUSTOMER nalog</Button>
      <p>Već imaš nalog? <Link to="/login">Prijavi se</Link></p>
    </form>
  </Card></main>
}
