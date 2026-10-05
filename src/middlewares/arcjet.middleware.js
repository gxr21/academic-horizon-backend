/**
 * Arcjet Security Middleware
 * Provides WAF, DDoS protection, and bot detection.
 */

// ─── Rate Limiting Store ─────────────────────────────────────
// Using Map for in-memory storage. In production with multiple instances,
// switch to Redis or a distributed store.
const rateLimitStore = new Map();

// ─── Periodic Cleanup ────────────────────────────────────────
// Clean up expired rate limit entries every minute to prevent memory leaks.
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, timestamps] of rateLimitStore.entries()) {
    const windowMs = 15 * 60 * 1000; // default
    const valid = timestamps.filter((ts) => ts > now - windowMs);
    if (valid.length === 0) {
      rateLimitStore.delete(key);
      cleaned++;
    } else if (valid.length !== timestamps.length) {
      rateLimitStore.set(key, valid);
    }
  }
  if (cleaned > 0) {
    console.log(`[Arcjet] Cleaned ${cleaned} expired rate limit entries`);
  }
}, 60 * 1000).ref(); // keep reference if needed

// ─── WAF Patterns ────────────────────────────────────────────
// NOTE: patterns target real attack *structures* (not single common words), otherwise
// normal user text such as "create a presentation" or "A & B" would be blocked.
const WAF_PATTERNS = {
  sql_injection:
    /(\bunion\b\s+(all\s+)?select\b|\bselect\b[\s\S]{1,80}\bfrom\b|\bdrop\s+(table|database)\b|\binsert\s+into\b|\bdelete\s+from\b|\bupdate\b\s+\S+\s+set\b|\bor\s+1\s*=\s*1\b|['"]\s*;\s*(drop|delete|insert|update|alter|exec)\b|\bexec(ute)?\s*\()/i,
  xss: /(javascript:|\bon(click|error|load|mouseover|focus|submit)\s*=|<\s*script|<\s*img|<\s*iframe)/i,
  path_traversal: /(\.\.\/|\.\.\\)/,
  command_injection:
    /(\$\(|`|&&|\|\||;\s*(rm|cat|ls|curl|wget|bash|sh|powershell|cmd)\b|\|\s*(sh|bash|nc|cat)\b)/i,
};

/**
 * Create Arcjet security middleware.
 */
export const arcjetMiddleware = (options = {}) => {
  const {
    enabled = true,
    mode = 'block', // 'block' | 'monitor'
    characteristics = ['ip', 'userAgent'],
    block_bots = true,
    detect_bots = true,
    rate_limit = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // max requests per window per IP
    },
    waf_enabled = true,
  } = options;

  return (req, res, next) => {
    if (!enabled) return next();

    try {
      const clientIP = (req.ip || req.connection.remoteAddress || '0.0.0.0').split(',')[0].trim();
      
      // ─── Bot Detection ───────────────────────────────────────
      if (detect_bots) {
        const userAgent = (req.get('user-agent') || '').toLowerCase();
        let botScore = 0;

        const botPatterns = [
          /bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i, /wget/i, /postman/i, /insomnia/i,
          /python-requests/i, /java\/|android|go-http/i,
        ];
        for (const pattern of botPatterns) {
          if (userAgent.match(pattern)) botScore += 30;
        }

        // Suspicious if no user-agent
        if (!userAgent || userAgent.length < 10) botScore += 50;

        // Block known bad bots if configured
        if (block_bots && botScore >= 80) {
          console.warn(`[Arcjet] Bot blocked: ${clientIP} (score: ${botScore}, UA: ${req.get('user-agent')})`);
          return res.status(403).json({
            success: false,
            error: {
              code: 'BOT_DETECTED',
              message: 'Automated requests are not allowed',
            },
          });
        }
      }

      // ─── WAF — SQL Injection / XSS Detection ──────────────────
      if (waf_enabled) {
        const checkPayload = (obj) => {
          if (!obj || typeof obj !== 'object') return false;
          try {
            const str = JSON.stringify(obj).toLowerCase();
            for (const [rule, pattern] of Object.entries(WAF_PATTERNS)) {
              if (pattern.test(str)) {
                console.warn(`[Arcjet] WAF trigger: ${rule} from ${clientIP} on ${req.originalUrl}`);
                return true;
              }
            }
          } catch (_) {}
          return false;
        };

        const payload = req.body || req.query || req.params;
        if (checkPayload(payload)) {
          if (mode === 'block') {
            return res.status(400).json({
              success: false,
              error: {
                code: 'MALICIOUS_REQUEST',
                message: 'Request blocked by security policy',
              },
            });
          }
          console.warn(`[Arcjet] Suspicious request from ${clientIP} (monitor mode)`);
        }
      }

      // ─── Rate Limiting ──────────────────────────────────────
      const rateKey = `rl:${clientIP}`;
      const now = Date.now();
      const windowMs = rate_limit.windowMs;
      const maxRequests = rate_limit.max;

      const timestamps = rateLimitStore.get(rateKey) || [];
      const windowStart = now - windowMs;
      const validTimestamps = timestamps.filter((ts) => ts > windowStart);

      if (validTimestamps.length >= maxRequests) {
        console.warn(`[Arcjet] Rate limit exceeded: ${clientIP} (${validTimestamps.length}/${maxRequests})`);
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
          },
        });
      }

      validTimestamps.push(now);
      rateLimitStore.set(rateKey, validTimestamps);

      next();
    } catch (error) {
      console.error('[Arcjet] Middleware error:', error);
      next(); // Fail open on unexpected errors
    }
  };
};

export default arcjetMiddleware;
