import { z } from 'zod';

export const sendMessageSchema = z.object({
  encryptedMessage: z
    .string({ required_error: 'Encrypted message is required' })
    .min(1, 'Encrypted message cannot be empty'),
  iv: z
    .string({ required_error: 'IV is required' })
    .min(1, 'IV cannot be empty'),
  wrappedKey: z.string().optional(),
  senderWrappedKey: z.string().optional(),
  adminWrappedKeys: z
    .array(z.object({ adminId: z.string().min(1), wrappedKey: z.string().min(1) }))
    .max(10)
    .optional(),
  messageType: z.enum(['text', 'file', 'system']).optional().default('text'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
