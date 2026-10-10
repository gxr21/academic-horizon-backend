import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/env.js';
import { getFrontendUrl } from '../config/frontend.js';
import { notifyRole } from './notification.service.js';
import { sendPasswordResetEmail } from './email.service.js';
import {
  UnauthorizedError,
  ConflictError,
  ValidationError,
  RestrictedError,
} from '../utils/errors.js';
import { evaluateRestriction, restrictionMessage } from '../utils/restriction.js';

const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Generate JWT token for a user.
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Get provider email domain from env or default.
 */
const getProviderEmailDomain = () => {
  return process.env.PROVIDER_EMAIL_DOMAIN || '@academic.com';
};

/**
 * Register a new user.
 */
export const register = async ({ name, email, password, role }) => {
  // Check if user exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ConflictError('This email is already registered');
  }

  // Provider email restriction
  if (role === 'provider') {
    const providerDomain = getProviderEmailDomain();
    if (!email.endsWith(providerDomain)) {
      throw new ValidationError(
        `Providers must use an official email (ending with ${providerDomain})`
      );
    }
  }

  // Students cannot use provider emails
  if (role === 'student' && email.endsWith(getProviderEmailDomain())) {
    throw new ValidationError(
      'Students cannot use provider email domains'
    );
  }

  const user = await User.create({ name, email, password, role });

  // Let admins know a new account joined (shows up live in their dashboard)
  await notifyRole('admin', {
    type: 'new_user',
    title: role === 'provider' ? 'مزود خدمة جديد' : 'طالب جديد',
    message: `انضم ${name} (${email}) إلى المنصة.`,
  });

  const token = generateToken(user);

  return {
    token,
    user: user.toJSON(),
  };
};

/**
 * Login an existing user.
 */
export const login = async ({ email, password }) => {
  // Find user and include password for comparison
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.is_active) {
    throw new UnauthorizedError('Account is deactivated');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const restriction = await evaluateRestriction(user);
  if (restriction.restricted) {
    throw new RestrictedError(restrictionMessage(restriction));
  }

  const token = generateToken(user);

  return {
    token,
    user: user.toJSON(),
  };
};

/**
 * Get current user profile from token.
 */
export const getMe = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new UnauthorizedError('User not found');
  }
  return user.toJSON();
};

/**
 * Always returns a generic success so callers cannot probe which emails exist.
 */
export const forgotPassword = async (email) => {
  const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select(
    '+password_reset_token +password_reset_expires'
  );
  if (!user || !user.is_active) {
    return { queued: false };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  user.password_reset_token = hashResetToken(rawToken);
  user.password_reset_expires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${getFrontendUrl()}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail({ name: user.name, email: user.email, resetUrl });
  return { queued: true };
};

const maskEmail = (email = '') => {
  const [local = '', domain = ''] = String(email).split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
};

const INVALID_RESET_MESSAGE = 'رابط إعادة التعيين غير صالح أو منتهٍ. اطلب رابطاً جديداً.';

/**
 * Lets the reset page tell the visitor straight away whether the link still works.
 */
export const verifyResetToken = async (token) => {
  const user = await User.findOne({
    password_reset_token: hashResetToken(String(token || '').trim()),
    password_reset_expires: { $gt: new Date() },
  }).select('+password_reset_token +password_reset_expires');

  if (!user || !user.is_active) {
    throw new ValidationError(INVALID_RESET_MESSAGE);
  }

  return {
    email: maskEmail(user.email),
    expiresAt: user.password_reset_expires,
  };
};

export const resetPassword = async ({ token, password }) => {
  const hashed = hashResetToken(String(token || '').trim());
  const user = await User.findOne({
    password_reset_token: hashed,
    password_reset_expires: { $gt: new Date() },
  }).select('+password +password_reset_token +password_reset_expires');

  if (!user) {
    throw new ValidationError(INVALID_RESET_MESSAGE);
  }

  user.password = password;
  user.password_reset_token = null;
  user.password_reset_expires = null;
  await user.save();

  return { email: user.email };
};
