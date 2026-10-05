import { z } from 'zod';

export const createReportSchema = z.object({
  orderId: z.string({ required_error: 'Order ID is required' }).trim().min(1),
  reason: z.enum(['harassment', 'spam', 'inappropriate', 'fraud', 'other'], {
    errorMap: () => ({ message: 'Reason must be harassment, spam, inappropriate, fraud, or other' }),
  }),
  details: z
    .string({ required_error: 'Details are required' })
    .trim()
    .min(10, 'Details must be at least 10 characters')
    .max(1000, 'Details must be at most 1000 characters'),
});

export const restrictUserSchema = z
  .object({
    type: z.enum(['temporary', 'permanent'], {
      errorMap: () => ({ message: 'Type must be temporary or permanent' }),
    }),
    days: z.coerce.number().int().min(1).max(365).optional(),
    until: z.coerce.date().optional(),
    reason: z.string().trim().max(500).optional().default(''),
    reportId: z.string().trim().optional(),
  })
  .refine((data) => data.type === 'permanent' || data.days || data.until, {
    message: 'Specify days or until for a temporary restriction',
    path: ['days'],
  });

export const reviewReportSchema = z.object({
  status: z.enum(['reviewed', 'dismissed', 'actioned'], {
    errorMap: () => ({ message: 'Status must be reviewed, dismissed, or actioned' }),
  }),
  adminNote: z.string().trim().max(500).optional().default(''),
});
