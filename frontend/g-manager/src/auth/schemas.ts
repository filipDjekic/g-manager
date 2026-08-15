import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Unesite ispravnu email adresu.'),
  password: z.string().min(8, 'Lozinka mora imati najmanje 8 karaktera.'),
})

export const activationSchema = z.object({
  activationSecret: z.string().trim().min(1, 'Aktivacioni kod je obavezan.').max(100),
  password: z.string().min(8, 'Lozinka mora imati najmanje 8 karaktera.').max(100),
})
