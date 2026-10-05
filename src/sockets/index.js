import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, CORS_ORIGIN } from '../config/env.js';
import { registerChatHandlers } from './chat.handler.js';
import { setIO } from './io.js';
import User from '../models/User.js';
import { evaluateRestriction, restrictionMessage } from '../utils/restriction.js';

/**
 * Initialize Socket.io with JWT authentication.
 */
export const initializeSocket = (httpServer) => {
  const origins = CORS_ORIGIN ? CORS_ORIGIN.split(',').map((o) => o.trim()) : ['http://localhost:5173'];

  const io = new Server(httpServer, {
    cors: {
      origin: origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Make the io instance available to services (notifications, file events, ...)
  setIO(io);

  // Rate limiting per socket: max 10 messages per 10 seconds
  const messageRateLimit = new Map(); // socket.id → { count, resetAt }

  // JWT Authentication Middleware for Socket.io
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user || !user.is_active) {
        return next(new Error('Account is deactivated'));
      }
      const restriction = await evaluateRestriction(user);
      if (restriction.restricted) {
        return next(new Error(restrictionMessage(restriction)));
      }
      socket.user = {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
      };
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Token expired'));
      }
      return next(new Error('Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.user.email} (${socket.user.id})`);

    // Personal room — used to push notifications to this user in real time
    socket.join(`user:${socket.user.id}`);

    // Register chat event handlers
    registerChatHandlers(io, socket);

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`🔌 User disconnected: ${socket.user.email} — ${reason}`);
      // Clean up rate limit data
      messageRateLimit.delete(socket.id);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.user.email}:`, error.message);
    });
  });

  return io;
};
