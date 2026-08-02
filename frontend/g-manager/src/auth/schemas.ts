import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Unesite ispravnu email adresu.'),
  password: z.string().min(8, 'Lozinka mora imati najmanje 8 karaktera.'),
})

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Ime je obavezno.').max(120),
  email: z.email('Unesite ispravnu email adresu.'),
  password: z.string().min(8, 'Lozinka mora imati najmanje 8 karaktera.').max(100),
})
