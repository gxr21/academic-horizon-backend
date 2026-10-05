const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
};

const methods = {
  GET: colors.green,
  POST: colors.blue,
  PUT: colors.yellow,
  PATCH: colors.yellow,
  DELETE: colors.red,
};

/**
 * Structured request logging middleware.
 * Logs: method, url, status, duration, user ID.
 */
export const loggerMiddleware = (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl } = req;
  const userId = req.user?.id ? `[user:${req.user.id}]` : '[anon]';
  const methodColor = methods[method] || colors.reset;

  // Log on response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const statusColor = status >= 500 ? colors.red : status >= 400 ? colors.yellow : colors.green;

    const logLine = `${colors.gray}[${new Date().toISOString()}]${colors.reset} ${methodColor}${method}${colors.reset} ${originalUrl} ${userId} → ${statusColor}${status}${colors.reset} in ${duration}ms`;

    if (status >= 500) {
      console.error(logLine);
    } else if (status >= 400) {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }
  });

  next();
};

/**
 * Simple audit logger for security events.
 * Call this from anywhere: auditLog(req, 'USER_LOGIN', { userId })
 */
export const auditLog = (req, action, metadata = {}) => {
  const log = {
    timestamp: new Date().toISOString(),
    requestId: req.id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id || null,
    action,
    url: req.originalUrl,
    method: req.method,
    ...metadata,
  };

  // In production, send to a log aggregation service (ELK, Datadog, etc.)
  console.log(`[AUDIT] ${JSON.stringify(log)}`);
};
