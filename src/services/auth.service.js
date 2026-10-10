import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/env.js';
import { getGoogleClientId } from '../config/google.js';
import { getFrontendUrl } from '../config/frontend.js';
import { notifyRole } from './notification.service.js';
import { sendPasswordResetEmail, sendEmailVerificationEmail } from './email.service.js';
import { assertRealEmail } from '../utils/emailGuard.js';
import {
  AppError,
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
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_COOLDOWN_MS = 60 * 1000;

/**
 * Create a fresh verification link for the account and email it.
 * Skips sending when one went out less than a minute ago (stops mail bombing).
 */
const sendVerificationLink = async (user) => {
  const sentAt = user.email_verification_sent_at;
  if (sentAt && Date.now() - new Date(sentAt).getTime() < VERIFICATION_COOLDOWN_MS) {
    return { sent: true, throttled: true };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  user.email_verification_token = hashResetToken(rawToken);
  user.email_verification_expires = new Date(Date.now() + VERIFICATION_TTL_MS);
  user.email_verification_sent_at = new Date();
  await user.save({ validateBeforeSave: false });

  const verifyUrl = `${getFrontendUrl()}/verify-email?token=${rawToken}`;
  return sendEmailVerificationEmail({ name: user.name, email: user.email, verifyUrl });
};

const isAwaitingVerification = (user) =>
  !!user.email_verification_required && !user.email_verified && !user.google_id;

/**
 * Register a new user. The account stays locked until the emailed link is opened.
 */
export const register = async ({ name, email, password, role }) => {
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

  // Reject typos, throw-away inboxes and domains that cannot receive mail
  await assertRealEmail(email);

  const existingUser = await User.findOne({ email }).select('+google_id +email_verification_sent_at');
  let user;

  if (existingUser) {
    // Someone signed up with this address but never confirmed it. The real owner of the
    // inbox may be trying now, so replace the old attempt instead of blocking them forever.
    if (!isAwaitingVerification(existingUser)) {
      throw new ConflictError('This email is already registered');
    }
    existingUser.name = name;
    existingUser.password = password;
    existingUser.role = role;
    user = existingUser;
  } else {
    user = new User({
      name,
      email,
      password,
      role,
      email_verified: false,
      email_verification_required: true,
    });
  }

  await user.save();
  const mail = await sendVerificationLink(user);

  return {
    requiresVerification: true,
    email: user.email,
    emailSent: !!mail.sent,
  };
};

/**
 * Open the emailed link: proves the visitor owns the inbox, then signs them in.
 */
export const verifyEmail = async (token) => {
  const user = await User.findOne({
    email_verification_token: hashResetToken(String(token || '').trim()),
    email_verification_expires: { $gt: new Date() },
  }).select('+email_verification_token +email_verification_expires');

  if (!user) {
    throw new ValidationError(
      'رابط التفعيل غير صالح أو منتهٍ. إذا فعّلت حسابك سابقاً فسجّل الدخول مباشرة، وإلا اطلب رابطاً جديداً.'
    );
  }

  if (!user.is_active) {
    throw new UnauthorizedError('Account is deactivated');
  }

  const wasPending = !user.email_verified;
  user.email_verified = true;
  user.email_verified_at = new Date();
  user.email_verification_token = null;
  user.email_verification_expires = null;
  await user.save({ validateBeforeSave: false });

  // Admins only hear about people who proved their email is real
  if (wasPending) {
    await notifyRole('admin', {
      type: 'new_user',
      title: user.role === 'provider' ? 'مزود خدمة جديد' : 'طالب جديد',
      message: `انضم ${user.name} (${user.email}) إلى المنصة.`,
    });
  }

  return {
    token: generateToken(user),
    user: user.toJSON(),
  };
};

/**
 * Always answers the same, so nobody can probe which emails are registered.
 */
export const resendVerification = async (email) => {
  const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select(
    '+google_id +email_verification_sent_at'
  );
  if (!user || !user.is_active || !isAwaitingVerification(user)) {
    return { queued: false };
  }
  const mail = await sendVerificationLink(user);
  return { queued: !!mail.sent };
};

/**
 * Login an existing user.
 */
export const login = async ({ email, password }) => {
  // Find user and include password for comparison
  const user = await User.findOne({ email }).select('+password +google_id');

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.is_active) {
    throw new UnauthorizedError('Account is deactivated');
  }

  if (!user.password) {
    throw new UnauthorizedError(
      'هذا الحساب مسجّل عبر Google. ادخل بزر Google، أو اختر «نسيت كلمة المرور» لتعيين كلمة مرور.'
    );
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Checked after the password so strangers cannot tell which emails exist
  if (isAwaitingVerification(user)) {
    throw new AppError(
      'لم يتم تأكيد بريدك الإلكتروني بعد. افتح الرابط الذي أرسلناه إلى بريدك، أو اطلب رابطاً جديداً.',
      403,
      'EMAIL_NOT_VERIFIED'
    );
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

const googleClient = new OAuth2Client();

const cleanDisplayName = (rawName, email) => {
  let name = String(rawName || '').replace(/[<>]/g, '').trim();
  if (name.length < 3) name = String(email).split('@')[0];
  if (name.length < 3) name = `${name}___`.slice(0, 3);
  return name.slice(0, 50);
};

/**
 * Sign in (or sign up) with a Google ID token.
 * Google signs the token, so the email inside it is proven to belong to the visitor.
 */
export const loginWithGoogle = async ({ credential }) => {
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: getGoogleClientId(),
    });
    payload = ticket.getPayload();
  } catch (error) {
    console.warn('Google token rejected:', error.message);
    throw new UnauthorizedError('تعذر التحقق من حساب Google. حاول مرة أخرى.');
  }

  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new UnauthorizedError('بريد Google هذا غير موثّق، لذلك لا يمكن استخدامه.');
  }

  const email = payload.email.trim().toLowerCase();
  const googleId = payload.sub;

  let user = await User.findOne({ $or: [{ google_id: googleId }, { email }] }).select(
    '+google_id +password +email_verification_token +email_verification_expires'
  );
  let isNew = false;

  if (!user) {
    if (email.endsWith(getProviderEmailDomain())) {
      throw new ValidationError('Students cannot use provider email domains');
    }

    user = await User.create({
      name: cleanDisplayName(payload.name, email),
      email,
      google_id: googleId,
      email_verified: true,
      email_verified_at: new Date(),
      avatar_url: payload.picture || null,
      role: 'student',
    });
    isNew = true;

    await notifyRole('admin', {
      type: 'new_user',
      title: 'طالب جديد',
      message: `انضم ${user.name} (${email}) عبر Google.`,
    });
  } else {
    if (!user.is_active) {
      throw new UnauthorizedError('Account is deactivated');
    }

    if (user.google_id && user.google_id !== googleId) {
      throw new UnauthorizedError('هذا البريد مرتبط بحساب Google آخر.');
    }

    const restriction = await evaluateRestriction(user);
    if (restriction.restricted) {
      throw new RestrictedError(restrictionMessage(restriction));
    }

    // Link the Google account and mark the email as verified
    let changed = false;
    if (!user.google_id) {
      user.google_id = googleId;
      changed = true;
    }
    if (!user.email_verified) {
      // The password on an unconfirmed account may have been typed by a stranger who used
      // this address, so drop it. The real owner can set their own via "forgot password".
      if (user.email_verification_required && user.password) {
        user.password = undefined;
      }
      user.email_verification_token = null;
      user.email_verification_expires = null;
      user.email_verified = true;
      user.email_verified_at = new Date();
      changed = true;
    }
    if (changed) await user.save({ validateBeforeSave: false });
  }

  return {
    token: generateToken(user),
    user: user.toJSON(),
    isNew,
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
  // Opening a link sent to the inbox proves the owner, so the email counts as confirmed
  if (!user.email_verified) {
    user.email_verified = true;
    user.email_verified_at = new Date();
  }
  await user.save();

  return { email: user.email };
};
