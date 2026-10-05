import sanitizeHtml from 'sanitize-html';

/**
 * Express middleware to sanitize request inputs against XSS.
 * Uses sanitize-html library.
 *
 * Sanitizes: req.body, req.query, req.params
 */
export const sanitizeInput = (options = {}) => {
  const defaultOptions = {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    allowedAttributes: {
      a: ['href', 'title', 'target'],
    },
    allowedStyles: {},
    stripComments: true,
    transformTags: {
      'a': (tagName, attribs) => {
        // Add rel="noopener noreferrer" to all links
        return { tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } };
      },
    },
  };

  const sanitizeOptions = { ...defaultOptions, ...options };

  return (req, res, next) => {
    try {
      // Helper to recursively sanitize object values
      const sanitizeValue = (value) => {
        if (typeof value === 'string') {
          // Basic string sanitization
          return sanitizeHtml(value, sanitizeOptions).trim();
        }
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            return value.map((item) => sanitizeValue(item));
          }
          const sanitized = {};
          for (const [key, val] of Object.entries(value)) {
            sanitized[key] = sanitizeValue(val);
          }
          return sanitized;
        }
        return value;
      };

      // Sanitize body, query, params
      if (req.body) req.body = sanitizeValue(req.body);
      // Express 5: req.query is a getter-only property, so define it explicitly
      if (req.query && Object.keys(req.query).length > 0) {
        Object.defineProperty(req, 'query', {
          value: sanitizeValue(req.query),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      // req.params is populated per-route by the router, so it's not sanitized here.

      next();
    } catch (error) {
      console.error('Sanitization error:', error);
      next();
    }
  };
};

/**
 * Header security middleware — add security headers
 */
export const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
};
