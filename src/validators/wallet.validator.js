import { z } from 'zod';
import { MIN_WITHDRAWAL_IQD } from '../utils/mastercard.js';

export const withdrawalRequestSchema = z
  .object({
    method: z.enum(['mastercard', 'zaincash', 'asiahawala']).optional().default('mastercard'),
    amount: z.coerce.number().int().min(MIN_WITHDRAWAL_IQD, `أقل مبلغ للسحب هو ${MIN_WITHDRAWAL_IQD} دينار`),
    cardHolderName: z.string().trim().min(3).max(80),
    cardNumber: z.string().trim().max(23).optional().default(''),
    cardExpiry: z.string().trim().optional().default(''),
    walletNumber: z.string().trim().max(20).optional().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.method === 'mastercard') {
      if (data.cardNumber.length < 13) {
        ctx.addIssue({ code: 'custom', path: ['cardNumber'], message: 'اكتب رقم البطاقة' });
      }
      if (!/^\d{2}\/\d{2}$/.test(data.cardExpiry)) {
        ctx.addIssue({ code: 'custom', path: ['cardExpiry'], message: 'تاريخ الانتهاء بصيغة MM/YY' });
      }
    } else if (data.walletNumber.length < 10) {
      ctx.addIssue({ code: 'custom', path: ['walletNumber'], message: 'اكتب رقم المحفظة بصيغة 07xxxxxxxxx' });
    }
  });

export const reviewWithdrawalSchema = z.object({
  status: z.enum(['paid', 'rejected']),
  adminNote: z.string().trim().max(500).optional().default(''),
});

export const commissionSchema = z.object({
  commissionPercent: z.coerce.number().min(0).max(100),
});
