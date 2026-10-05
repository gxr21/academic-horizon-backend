import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import { sendError } from '../utils/response.js';
import User from '../models/User.js';
import { evaluateRestriction, restrictionMessage } from '../utils/restriction.js';

/**
 * Authenticate JWT from Authorization header.
 * Attaches user object to req.user.
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'UNAUTHORIZED', 'Authentication token is required', 401);
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return sendError(res, 'UNAUTHORIZED', 'Authentication token is required', 401);
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id);

    if (!user) {
      return sendError(res, 'UNAUTHORIZED', 'User not found', 401);
    }

    if (!user.is_active) {
      return sendError(res, 'UNAUTHORIZED', 'Account is deactivated', 401);
    }

    const restriction = await evaluateRestriction(user);
    if (restriction.restricted) {
      return sendError(res, 'ACCOUNT_RESTRICTED', restrictionMessage(restriction), 403);
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      subscriptionType: user.subscription_type,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return sendError(res, 'TOKEN_EXPIRED', 'Token has expired', 401);
    }
    if (error.name === 'JsonWebTokenError') {
      return sendError(res, 'INVALID_TOKEN', 'Invalid token', 401);
    }
    return sendError(res, 'UNAUTHORIZED', 'Authentication failed', 401);
  }
};
