import { z } from 'zod';

export const paymentDecisionSchema = z
  .object({
    decision: z.enum(['confirm', 'reject']),
    note: z.string().trim().max(500).optional().default(''),
  })
  .refine((d) => d.decision === 'confirm' || d.note.length >= 3, {
    message: 'اكتب سبب الرفض ليعرف الطالب ما المطلوب',
    path: ['note'],
  });

export const paymentSettingsSchema = z.object({
  methods: z
    .array(
      z.object({
        id: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9_-]{2,40}$/, 'معرّف الطريقة بأحرف إنجليزية وأرقام فقط'),
        label: z.string().trim().min(2).max(60),
        account: z.string().trim().min(3).max(120),
        holder: z.string().trim().max(80).optional().default(''),
      })
    )
    .max(6)
    .refine((list) => new Set(list.map((m) => m.id)).size === list.length, {
      message: 'لا تكرر معرّف طريقة الدفع',
    }),
  instructions: z.string().trim().max(600).optional().default(''),
});
