import { GOOGLE_CLIENT_ID } from './env.js';

// The OAuth client ID is public (it also ships inside the frontend), so a default is safe.
export const DEFAULT_GOOGLE_CLIENT_ID =
  '697062121172-jqe2b509919dm6jmcgg5m625jdcmjp6g.apps.googleusercontent.com';

export const getGoogleClientId = () => (GOOGLE_CLIENT_ID || '').trim() || DEFAULT_GOOGLE_CLIENT_ID;
