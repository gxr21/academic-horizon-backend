import { z } from 'zod';
import { MIN_WITHDRAWAL_IQD } from '../utils/mastercard.js';

export const withdrawalRequestSchema = z.object({
  amount: z.coerce.number().int().min(MIN_WITHDRAWAL_IQD, `أقل مبلغ للسحب هو ${MIN_WITHDRAWAL_IQD} دينار`),
  cardHolderName: z.string().trim().min(3).max(80),
  cardNumber: z.string().trim().min(13).max(23),
  cardExpiry: z.string().trim().regex(/^\d{2}\/\d{2}$/, 'تاريخ الانتهاء بصيغة MM/YY'),
});

export const reviewWithdrawalSchema = z.object({
  status: z.enum(['paid', 'rejected']),
  adminNote: z.string().trim().max(500).optional().default(''),
});

export const commissionSchema = z.object({
  commissionPercent: z.coerce.number().min(0).max(100),
});
