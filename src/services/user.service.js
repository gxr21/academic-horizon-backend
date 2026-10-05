import User from '../models/User.js';
import Order from '../models/Order.js';
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from '../utils/errors.js';
import {
  SUBSCRIPTION,
  SUBSCRIPTION_DURATION_DAYS,
  ROLES,
  ORDER_STATUS,
} from '../utils/constants.js';

const COMPLETED_STATUSES = [ORDER_STATUS.COMPLETED, ORDER_STATUS.DELIVERED];
const ACTIVE_STATUSES = [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED, ORDER_STATUS.IN_PROGRESS];

const applyPasswordChange = async (user, data) => {
  if (!data.newPassword) return;
  if (!data.currentPassword) {
    throw new ValidationError('Current password is required to set a new password');
  }
  const matches = await user.comparePassword(data.currentPassword);
  if (!matches) {
    throw new ValidationError('كلمة المرور الحالية غير صحيحة');
  }
  if (String(data.newPassword).length < 6) {
    throw new ValidationError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
  }
  user.password = data.newPassword;
};

/**
 * Get user profile by ID.
 */
export const getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');
  return user.toJSON();
};

/**
 * Students may update name, phone, email, gender, and password.
 * Providers may only change their password here — personal details go through
 * a documented change request that an admin reviews.
 */
export const updateProfile = async (userId, data) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new NotFoundError('User');

  const wantsPersonal =
    data.name !== undefined ||
    data.phone !== undefined ||
    data.email !== undefined ||
    data.bio !== undefined ||
    data.gender !== undefined ||
    data.avatarUrl !== undefined ||
    data.avatar_url !== undefined;

  if (user.role === ROLES.PROVIDER && wantsPersonal) {
    throw new ForbiddenError(
      'مزود الخدمة لا يعدّل بياناته الشخصية مباشرة. أرسل طلب تغيير مع المستمسكات للإدارة.'
    );
  }

  if (user.role !== ROLES.PROVIDER) {
    if (data.name !== undefined) user.name = String(data.name).trim();
    if (data.phone !== undefined) user.phone = String(data.phone).trim();
    if (data.gender !== undefined) user.gender = data.gender;
    if (data.bio !== undefined) user.bio = String(data.bio).trim();
    if (data.avatarUrl !== undefined) user.avatar_url = data.avatarUrl;
    if (data.avatar_url !== undefined) user.avatar_url = data.avatar_url;
    if (data.email !== undefined) {
      const nextEmail = String(data.email).trim().toLowerCase();
      if (nextEmail !== user.email) {
        if (await User.findOne({ email: nextEmail, _id: { $ne: user._id } })) {
          throw new ConflictError('This email is already registered');
        }
        user.email = nextEmail;
      }
    }
  }

  await applyPasswordChange(user, data);
  await user.save();
  return user.toJSON();
};

/**
 * Admin updates a student/provider (name, phone, email, bio).
 */
export const adminUpdateUser = async (userId, data) => {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');
  if (user.role === ROLES.ADMIN) {
    throw new ForbiddenError('Admin accounts cannot be edited from here');
  }

  if (data.name !== undefined) user.name = String(data.name).trim();
  if (data.phone !== undefined) user.phone = String(data.phone).trim();
  if (data.bio !== undefined) user.bio = String(data.bio).trim();
  if (data.email !== undefined) {
    const nextEmail = String(data.email).trim().toLowerCase();
    if (nextEmail !== user.email) {
      if (await User.findOne({ email: nextEmail, _id: { $ne: user._id } })) {
        throw new ConflictError('This email is already registered');
      }
      user.email = nextEmail;
    }
  }
  await user.save();
  return user.toJSON();
};

/**
 * Public-facing profile used in chat popups and profile pages.
 */
export const getPublicProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  const matchUser = { $or: [{ student_id: user._id }, { provider_id: user._id }] };
  const [completedCount, activeCount] = await Promise.all([
    Order.countDocuments({ ...matchUser, status: { $in: COMPLETED_STATUSES } }),
    Order.countDocuments({ ...matchUser, status: { $in: ACTIVE_STATUSES } }),
  ]);

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    bio: user.bio || '',
    role: user.role,
    gender: user.gender || 'unspecified',
    createdAt: user.created_at,
    completedCount,
    activeCount,
  };
};

/**
 * Upgrade user subscription (no real payment).
 */
export const upgradeSubscription = async (userId, subscriptionType) => {
  const validTypes = [SUBSCRIPTION.BASIC, SUBSCRIPTION.PRO];
  if (!validTypes.includes(subscriptionType)) {
    throw new ValidationError(
      `Subscription type must be one of: ${validTypes.join(', ')}`
    );
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SUBSCRIPTION_DURATION_DAYS);

  const user = await User.findByIdAndUpdate(
    userId,
    {
      subscription_type: subscriptionType,
      subscription_expires_at: expiresAt,
    },
    { new: true, runValidators: true }
  );

  if (!user) throw new NotFoundError('User');
  return user.toJSON();
};

/**
 * Store user's public key for E2EE.
 */
export const updatePublicKey = async (userId, publicKey) => {
  if (!publicKey) {
    throw new ValidationError('Public key is required');
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { public_key: publicKey },
    { new: true }
  );

  if (!user) throw new NotFoundError('User');
  return user.toJSON();
};

/**
 * Get a user's public key (for E2EE key exchange).
 */
export const getPublicKey = async (userId) => {
  const user = await User.findById(userId).select('public_key name');
  if (!user) throw new NotFoundError('User');

  return {
    id: user._id,
    name: user.name,
    publicKey: user.public_key,
  };
};

/**
 * Get all users (admin only).
 * Supports pagination and role filter.
 */
export const getAllUsers = async ({ page = 1, limit = 50, role } = {}) => {
  const query = {};
  if (role && Object.values(ROLES).includes(role)) {
    query.role = role;
  }
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [users, total] = await Promise.all([
    User.find(query).select('-password').skip(skip).limit(parseInt(limit)),
    User.countDocuments(query),
  ]);
  return {
    users: users.map((u) => u.toJSON()),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Delete a user (admin only). Cascades to orders and messages.
 */
export const deleteUser = async (userId) => {
  const user = await User.findByIdAndDelete(userId);
  if (!user) throw new NotFoundError('User');
  return { success: true };
};
