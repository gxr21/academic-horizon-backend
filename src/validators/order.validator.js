import { z } from 'zod';

/**
 * Create an order either:
 *  - from a catalog service  → { serviceId }  (title/price are taken from the service on the server), or
 *  - as a custom/package order → { title, serviceType, ... }
 */
export const createOrderSchema = z
  .object({
    serviceId: z.string().trim().min(1).optional(),
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(200, 'Title must be at most 200 characters')
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, 'Description must be at most 2000 characters')
      .optional(),
    serviceType: z.string().trim().min(1, 'Service type is required').optional(),
    price: z.number().min(0, 'Price cannot be negative').optional().default(0),
    notes: z.string().trim().optional(),
  })
  .refine((data) => data.serviceId || (data.title && data.serviceType), {
    message: 'Either serviceId, or both title and serviceType, are required',
    path: ['title'],
  });

export const updateStatusSchema = z.object({
  status: z.enum(
    ['pending', 'assigned', 'in_progress', 'completed', 'delivered', 'cancelled'],
    {
      errorMap: () => ({
        message:
          'Status must be one of: pending, assigned, in_progress, completed, delivered, cancelled',
      }),
    }
  ),
  // Optional note (e.g. the admin's reason when sending an order back to the provider)
  note: z.string().trim().max(500, 'Note must be at most 500 characters').optional(),
});

export const assignProviderSchema = z.object({
  providerId: z.string({ required_error: 'Provider ID is required' }).min(1),
});
