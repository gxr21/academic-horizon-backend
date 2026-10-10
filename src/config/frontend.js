import { FRONTEND_URL, NODE_ENV } from './env.js';

// Where the React app lives when FRONTEND_URL is missing or wrong in production.
export const DEFAULT_FRONTEND_URL = 'https://academic-horizon-frontend.onrender.com';

const LOCAL_HOST = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

const trimSlash = (url) => url.trim().replace(/\/+$/, '');

/**
 * Public address of the frontend, used in email links.
 * A localhost value is only accepted outside production.
 */
export const getFrontendUrl = () => {
  const configured = trimSlash(FRONTEND_URL || '');

  if (NODE_ENV === 'production') {
    return !configured || LOCAL_HOST.test(configured) ? DEFAULT_FRONTEND_URL : configured;
  }
  return configured || 'http://localhost:5173';
};

/**
 * Base URL to send a browser to when it opens a frontend page on the API host.
 * If the configured frontend is the very host that received the request,
 * redirecting there would loop, so the default frontend is used instead.
 */
export const getRedirectFrontendUrl = (requestHost = '') => {
  const base = getFrontendUrl();
  try {
    if (new URL(base).host.toLowerCase() === String(requestHost).toLowerCase()) {
      return DEFAULT_FRONTEND_URL;
    }
  } catch {
    return DEFAULT_FRONTEND_URL;
  }
  return base;
};
