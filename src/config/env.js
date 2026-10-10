import { config } from 'dotenv';
import process from 'node:process';

config({
  path: `.env.${process.env.NODE_ENV || 'development'}.local`,
});

export const {
  PORT,
  MONGODB_URI,
  NODE_ENV,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  CORS_ORIGIN,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_MAX,
  MAX_FILE_SIZE,
  UPLOAD_DIR,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  FRONTEND_URL,
  GOOGLE_CLIENT_ID,
  PLATFORM_COMMISSION_PERCENT,
} = process.env;