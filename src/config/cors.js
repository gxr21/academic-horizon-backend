import { CORS_ORIGIN } from './env.js';

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://academic-horizon-frontend.onrender.com',
  'https://academichorizonapp.fyi',
  'https://www.academichorizonapp.fyi',
];

const normalize = (origin) => origin.trim().replace(/\/$/, '');

export const getCorsOrigins = () => {
  const fromEnv = (CORS_ORIGIN || '')
    .split(',')
    .map(normalize)
    .filter(Boolean);

  return [...new Set([...DEFAULT_ORIGINS, ...fromEnv])];
};

export const corsOptions = () => {
  const origins = getCorsOrigins();

  return {
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  };
};
