import { z } from 'zod'

export const workingHoursExceptionSchema = z.object({
  date: z.string().min(1, 'Datum je obavezan.'),
  description: z.string().max(500).optional(),
  fullDayClosed: z.boolean(),
  overrideOpenTime: z.string().optional(),
  overrideCloseTime: z.string().optional(),
}).superRefine((value, context) => {
  if (!value.fullDayClosed && (!value.overrideOpenTime || !value.overrideCloseTime)) {
    context.addIssue({
      code: 'custom',
      path: ['overrideOpenTime'],
      message: 'Početak i kraj skraćenog radnog vremena su obavezni.',
    })
  }
  if (!value.fullDayClosed && value.overrideOpenTime === value.overrideCloseTime) {
    context.addIssue({
      code: 'custom',
      path: ['overrideCloseTime'],
      message: 'Radno vreme ne može imati nulto trajanje.',
    })
  }
})
