import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { authApi } from '../api/authApi'
import { apiErrorMessage } from '../api/client'
import { registerSchema } from '../auth/schemas'

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
      setServerError(apiErrorMessage(error, 'Registracija trenutno nije dostupna.'))
    }
  })

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <p className="eyebrow">Novi nalog</p>
        <h1>Registracija</h1>
        <label>
          Ime
          <input autoComplete="name" {...form.register('name')} />
          <span className="field-error">{form.formState.errors.name?.message}</span>
        </label>
        <label>
          Email
          <input type="email" autoComplete="email" {...form.register('email')} />
          <span className="field-error">{form.formState.errors.email?.message}</span>
        </label>
        <label>
          Lozinka
          <input type="password" autoComplete="new-password" {...form.register('password')} />
          <span className="field-error">{form.formState.errors.password?.message}</span>
        </label>
        {serverError && <div className="error-banner" role="alert">{serverError}</div>}
        <button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Kreiranje…' : 'Kreiraj CUSTOMER nalog'}
        </button>
        <p>Već imaš nalog? <Link to="/login">Prijavi se</Link></p>
      </form>
    </main>
  )
}
