import { z } from 'zod'

export const catalogItemSchema = z.object({
  name: z.string().trim().min(1, 'Naziv je obavezan.').max(150, 'Naziv može imati najviše 150 znakova.'),
  description: z.string().max(2000, 'Opis može imati najviše 2000 znakova.').optional(),
  type: z.enum(['PRODUCT', 'SERVICE']),
  price: z.number().positive('Cena mora biti veća od nule.').max(9999999999.99, 'Cena može imati najviše 10 cifara pre decimalnog zareza.')
    .refine(value => value === Math.round(value * 100) / 100, 'Cena može imati najviše dve decimale.'),
  durationMinutes: z.number().int('Trajanje mora biti ceo broj minuta.').positive('Trajanje mora biti veće od nule.').optional(),
  requiresResource: z.boolean().optional(),
}).superRefine((value, context) => {
  if (value.type === 'SERVICE' && value.durationMinutes === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['durationMinutes'],
      message: 'Trajanje je obavezno za uslugu.',
    })
  }
  if (value.type === 'PRODUCT' && value.durationMinutes !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['durationMinutes'],
      message: 'Proizvod ne može imati trajanje.',
    })
  }
  if (value.type === 'PRODUCT' && value.requiresResource) {
    context.addIssue({ code: 'custom', path: ['requiresResource'], message: 'Samo usluga može zahtevati fizički resurs.' })
  }
})
