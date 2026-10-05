import { z } from 'zod';

export const registerSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(3, 'Name must be at least 3 characters')
    .max(50, 'Name must be at most 50 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Please provide a valid email')
    .toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password must be at most 128 characters'),
  role: z
    .enum(['student', 'provider'], {
      errorMap: () => ({ message: 'Role must be student or provider' }),
    })
    .default('student'),
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Please provide a valid email')
    .toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('أدخل بريداً إلكترونياً صالحاً')
    .toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string({ required_error: 'رمز إعادة التعيين مطلوب' }).trim().min(16),
  password: z
    .string({ required_error: 'Password is required' })
    .min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل')
    .max(128, 'كلمة المرور طويلة جداً'),
});
