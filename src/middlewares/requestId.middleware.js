import { v4 as uuidv4 } from 'uuid';

/**
 * Adds a unique request ID to each incoming request.
 * Available as req.id and in response header X-Request-ID.
 * Essential for distributed tracing and debugging.
 */
export const requestIdMiddleware = (req, _res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.id = requestId;
  next();
};

/**
 * Response interceptor to add X-Request-ID header to responses.
 * Use this as the LAST middleware before routes.
 */
export const responseRequestId = (req, res, next) => {
  res.setHeader('X-Request-ID', req.id);
  next();
};
