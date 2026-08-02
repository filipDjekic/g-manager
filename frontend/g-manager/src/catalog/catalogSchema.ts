import { z } from 'zod'

export const catalogItemSchema = z.object({
  name: z.string().trim().min(1, 'Naziv je obavezan.').max(150),
  description: z.string().max(2000).optional(),
  type: z.enum(['PRODUCT', 'SERVICE']),
  price: z.number().positive('Cena mora biti veća od nule.'),
  durationMinutes: z.number().int().positive().optional(),
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
})
