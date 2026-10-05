import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import { PORT, NODE_ENV } from './config/env.js';
import { corsOptions, getCorsOrigins } from './config/cors.js';
import connectDB from './database/mongodb.js';
import { globalLimiter, authLimiter } from './middlewares/rateLimiter.middleware.js';
import { sanitizeInput, securityHeaders } from './middlewares/sanitize.middleware.js';
import { arcjetMiddleware } from './middlewares/arcjet.middleware.js';
import { requestIdMiddleware, responseRequestId } from './middlewares/requestId.middleware.js';
import { loggerMiddleware } from './middlewares/logger.middleware.js';
import { initializeSocket } from './sockets/index.js';
import { sendError, sendSuccess } from './utils/response.js';

// Load environment variables
config();

// Route imports
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import orderRoutes from './routes/order.routes.js';
import chatRoutes from './routes/chat.routes.js';
import fileRoutes from './routes/file.routes.js';
import adminRoutes from './routes/admin.routes.js';
import serviceRoutes from './routes/service.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import reportRoutes from './routes/report.routes.js';
import profileChangeRoutes from './routes/profileChange.routes.js';
import walletRoutes from './routes/wallet.routes.js';

// Create Express app and HTTP server
const app = express();
const httpServer = createServer(app);
app.set('trust proxy', 1);

// ─── Request ID (first — before any other middleware) ───────────────
app.use(requestIdMiddleware);
app.use(responseRequestId);

// ─── Security Headers ───────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // We set custom headers below
  })
);
app.use(securityHeaders);

// ─── Logging ────────────────────────────────────────────────────────
app.use(loggerMiddleware);

// ─── CORS ───────────────────────────────────────────────────────────
const origins = getCorsOrigins();
app.use(cors(corsOptions()));

// ─── Body Parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: '10mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Input Sanitization (XSS Protection) ────────────────────────────
app.use(sanitizeInput());

// ─── Arcjet WAF & Global Rate Limiting ──────────────────────────────
app.use(
  arcjetMiddleware({
    enabled: NODE_ENV !== 'test',
    mode: 'block',
    rate_limit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
      max: Math.max(parseInt(process.env.RATE_LIMIT_MAX) || 2000, 2000),
    },
  })
);

// ─── Strict Rate Limiting on Auth Endpoints ─────────────────────────
app.use('/api/auth', authLimiter);

// ─── Health Check (before main middleware) ─────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: NODE_ENV || 'development',
    },
    message: 'Server is healthy',
  });
});

// ─── API Routes ─────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/profile-changes', profileChangeRoutes);
app.use('/api/wallet', walletRoutes);

// ─── API Root (info) ────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Academic Horizon API',
      version: '1.0.0',
      endpoints: {
        auth: '/api/auth',
        users: '/api/user',
        admin: '/api/admin',
        orders: '/api/orders',
        chat: '/api/chat',
        files: '/api/files',
        services: '/api/services',
        notifications: '/api/notifications',
        reports: '/api/reports',
        wallet: '/api/wallet',
      },
    },
  });
});

// ─── 404 Handler ────────────────────────────────────────────────────
app.use((req, res) => {
  sendError(res, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`, 404);
});

// ─── Global Error Handler ───────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('❌ Unhandled Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 'FILE_TOO_LARGE', 'File size exceeds the limit', 400);
  }

  // Other Multer errors (unexpected field, too many files, ...)
  if (err.name === 'MulterError') {
    return sendError(res, 'UPLOAD_ERROR', err.message, 400);
  }

  // Invalid MongoDB ObjectId (e.g. /api/orders/123) — client error, not server error
  if (err.name === 'CastError') {
    return sendError(res, 'INVALID_ID', `Invalid ${err.path || 'id'}: ${err.value}`, 400);
  }

  // Zod validation errors (already handled but catch any that leak through)
  if (err.name === 'ZodError') {
    return sendError(
      res,
      'VALIDATION_ERROR',
      err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      400
    );
  }

  // Operational errors (AppError subclasses)
  if (err.isOperational) {
    return sendError(res, err.code || 'OPERATIONAL_ERROR', err.message, err.statusCode || 500);
  }

  // Unknown error — hide details in production
  const message = NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message;
  return sendError(res, 'INTERNAL_ERROR', message, 500);
});

// ─── Initialize Socket.io ──────────────────────────────────────────
const io = initializeSocket(httpServer);
app.set('io', io);

// ─── Graceful Shutdown ─────────────────────────────────────────────
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('❌ Forcing exit after 10s');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Start Server ──────────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();

    httpServer.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 Socket.io ready`);
      console.log(`🔐 CORS origins: ${origins.join(', ')}`);
      console.log(`📦 API routes: /api/auth, /api/user, /api/admin, /api/orders, /api/chat, /api/files`);
      console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
      console.log(`📚 API docs: http://localhost:${PORT}/api\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
