import rateLimit from 'express-rate-limit';
import {
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_MAX,
} from '../config/env.js';

/**
 * Global rate limiter: 100 requests per 15 minutes.
 */
export const globalLimiter = rateLimit({
  windowMs: parseInt(RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(RATE_LIMIT_MAX) || 100,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for auth endpoints: 10 requests per 15 minutes.
 */
export const authLimiter = rateLimit({
  windowMs: parseInt(RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(AUTH_RATE_LIMIT_MAX) || 10,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
