import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState, type FormEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { authApi } from '../api/authApi'
import { apiErrorMessage } from '../api/client'
import { activationFormSchema } from '../auth/schemas'
import { PasswordStrength } from '../auth/PasswordStrength'
import { applyApiFieldErrors } from '../common/applyApiFieldErrors'
import { Button, ErrorState } from '../components/ui'
import { AuthLayout } from '../layout/AuthLayout'
import { AuthField } from '../layout/AuthField'

type ActivationValues = z.infer<typeof activationFormSchema>

export function ActivatePage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmationVisible, setConfirmationVisible] = useState(false)
  const submitting = useRef(false)
  const form = useForm<ActivationValues>({
    resolver: zodResolver(activationFormSchema),
    defaultValues: { email: '', activationSecret: '', password: '', confirmPassword: '' },
  })
  const password = useWatch({ control: form.control, name: 'password' })

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    try {
      await form.handleSubmit(async (values) => {
        setError('')
        try {
          await authApi.activate({ email: values.email.trim(), activationSecret: values.activationSecret, password: values.password })
          navigate('/login', { replace: true, state: { activated: true } })
        } catch (cause) {
          applyApiFieldErrors(cause, form.setError, form.setFocus)
          setError(apiErrorMessage(cause, 'Aktivacija trenutno nije dostupna.'))
        }
      })(event)
    } finally {
      submitting.current = false
    }
  }

  return <AuthLayout>
    <form className="ui-form-grid gm-auth-form" onSubmit={submit} noValidate
      aria-labelledby="activation-title" aria-describedby="activation-description">
      <header className="gm-auth-heading">
        <span className="gm-auth-heading-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
            <path d="m8 12 3 3 5-6" />
          </svg>
        </span>
        <h1 id="activation-title">Aktivacija naloga</h1>
        <p id="activation-description">Unesite email i četvoroznakovni kod koji ste dobili od osoblja. Kod važi jedan sat.</p>
      </header>
      <AuthField id="activation-email" label="Email adresa" icon="email" type="email" required
        autoComplete="email" autoCapitalize="none" maxLength={180} spellCheck={false}
        readOnly={form.formState.isSubmitting} error={form.formState.errors.email?.message}
        {...form.register('email')} />
      <AuthField id="activation-secret" label="Aktivacioni kod" icon="key" required
        className="gm-activation-code" placeholder="A7K2" autoComplete="one-time-code" autoCapitalize="characters"
        minLength={4} maxLength={4} pattern="[A-Z0-9]{4}" inputMode="text"
        spellCheck={false} readOnly={form.formState.isSubmitting}
        error={form.formState.errors.activationSecret?.message}
        {...form.register('activationSecret', {
          onChange: event => {
            const value = event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4)
            event.target.value = value
            form.setValue('activationSecret', value)
          },
        })} />
      <AuthField id="activation-password" label="Nova lozinka" icon="lock" required
        autoComplete="new-password" autoCapitalize="none" spellCheck={false}
        readOnly={form.formState.isSubmitting} error={form.formState.errors.password?.message}
        hint={<PasswordStrength password={password} />}
        passwordToggle={{
          visible: passwordVisible,
          label: passwordVisible ? 'Sakrij novu lozinku' : 'Prikaži novu lozinku',
          onToggle: () => setPasswordVisible((visible) => !visible),
          disabled: form.formState.isSubmitting,
        }}
        {...form.register('password')} />
      <AuthField id="activation-confirm-password" label="Potvrda lozinke" icon="lock" required
        autoComplete="new-password" autoCapitalize="none" spellCheck={false}
        readOnly={form.formState.isSubmitting} error={form.formState.errors.confirmPassword?.message}
        passwordToggle={{
          visible: confirmationVisible,
          label: confirmationVisible ? 'Sakrij potvrdu lozinke' : 'Prikaži potvrdu lozinke',
          onToggle: () => setConfirmationVisible((visible) => !visible),
          disabled: form.formState.isSubmitting,
        }}
        {...form.register('confirmPassword')} />
      {error && <ErrorState title="Aktivacija nije uspela" message={error} />}
      <p className="gm-auth-activation">Kod izdaje osoblje prilikom registracije. Ako je kod istekao, već iskorišćen ili nedostaje, obratite se osoblju za proveru naloga.</p>
      <Button className="gm-auth-submit" type="submit" loading={form.formState.isSubmitting}>Aktiviraj nalog</Button>
      <p className="gm-auth-activation"><Link to="/login">← Nazad na prijavu</Link></p>
    </form>
  </AuthLayout>
}
