import { Router } from 'express';
import {
  register,
  login,
  googleLogin,
  getMe,
  forgotPassword,
  resetPassword,
  verifyResetToken,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authLimiter } from '../middlewares/rateLimiter.middleware.js';
import {
  registerSchema,
  loginSchema,
  googleLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';

const router = Router();

// POST /api/auth/register
router.post('/register', authLimiter, validate(registerSchema), register);

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), login);

// POST /api/auth/google — sign in / sign up with a Google ID token
router.post('/google', authLimiter, validate(googleLoginSchema), googleLogin);

// GET /api/auth/me
router.get('/me', authenticate, getMe);

router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), forgotPassword);
router.get('/reset-password/verify', verifyResetToken);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), resetPassword);

export default router;
