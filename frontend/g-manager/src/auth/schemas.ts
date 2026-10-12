import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Unesite ispravnu email adresu.'),
  password: z.string().min(8, 'Lozinka mora imati najmanje 8 karaktera.'),
})

export const activationSchema = z.object({
  activationSecret: z.string().trim().min(1, 'Aktivacioni kod je obavezan.').max(100),
  password: z.string().min(8, 'Lozinka mora imati najmanje 8 karaktera.').max(100, 'Lozinka može imati najviše 100 karaktera.'),
})

export const activationFormSchema = activationSchema.extend({
  confirmPassword: z.string().min(1, 'Potvrdite novu lozinku.'),
}).refine((values) => values.password === values.confirmPassword, {
  message: 'Lozinke se ne poklapaju.',
  path: ['confirmPassword'],
})
