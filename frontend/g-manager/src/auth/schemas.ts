import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Unesite ispravnu email adresu.'),
  password: z.string().min(8, 'Lozinka mora imati najmanje 8 karaktera.'),
})

export const activationSchema = z.object({
  email: z.email('Unesite ispravnu email adresu.').max(180),
  activationSecret: z.string().regex(/^[a-zA-Z0-9]{4}$/, 'Aktivacioni kod mora imati tačno 4 slova ili cifre.').toUpperCase(),
  password: z.string().min(8, 'Lozinka mora imati najmanje 8 karaktera.').max(100, 'Lozinka može imati najviše 100 karaktera.'),
})

export const activationFormSchema = activationSchema.extend({
  confirmPassword: z.string().min(1, 'Potvrdite novu lozinku.'),
}).refine((values) => values.password === values.confirmPassword, {
  message: 'Lozinke se ne poklapaju.',
  path: ['confirmPassword'],
})
