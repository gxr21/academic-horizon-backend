import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

/**
 * Validate that a user is a participant in an order (student or assigned provider).
 */
export const validateParticipant = async (orderId, userId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order');

  const isStudent = order.student_id.toString() === userId;
  const isProvider = order.provider_id && order.provider_id.toString() === userId;

  if (!isStudent && !isProvider) {
    throw new ForbiddenError('You are not a participant in this order');
  }

  return order;
};

/**
 * Save an encrypted message to the database.
 * Server NEVER sees plaintext — only stores encrypted blobs.
 */
export const saveMessage = async (
  orderId,
  senderId,
  { encryptedMessage, iv, wrappedKey, senderWrappedKey, adminWrappedKeys, messageType }
) => {
  // Validate participant
  await validateParticipant(orderId, senderId);

  // Keep only keys that really belong to existing admin accounts
  let adminKeys = [];
  if (Array.isArray(adminWrappedKeys) && adminWrappedKeys.length > 0) {
    const validIds = adminWrappedKeys
      .map((k) => k.adminId)
      .filter((id) => mongoose.isValidObjectId(id));
    const admins = await User.find({ _id: { $in: validIds }, role: 'admin' }).select('_id');
    const adminIdSet = new Set(admins.map((a) => a._id.toString()));
    adminKeys = adminWrappedKeys
      .filter((k) => adminIdSet.has(k.adminId))
      .map((k) => ({ admin_id: k.adminId, wrapped_key: k.wrappedKey }));
  }

  const message = await Message.create({
    admin_wrapped_keys: adminKeys,
    order_id: orderId,
    sender_id: senderId,
    encrypted_message: encryptedMessage,
    iv,
    wrapped_key: wrappedKey || null,
    sender_wrapped_key: senderWrappedKey || null,
    message_type: messageType || 'text',
  });

  return message.toJSON();
};

/**
 * Get paginated message history for an order.
 * Only participants can access.
 */
export const getMessageHistory = async (orderId, userId, { page = 1, limit = 20 }) => {
  // Validate participant
  await validateParticipant(orderId, userId);

  const skip = (page - 1) * limit;

  const [messages, total] = await Promise.all([
    Message.find({ order_id: orderId })
      .populate('sender_id', 'name email role')
      .sort({ created_at: 1 })
      .skip(skip)
      .limit(limit),
    Message.countDocuments({ order_id: orderId }),
  ]);

  return {
    messages: messages.map((m) => {
      const json = m.toJSON();
      if (m.sender_id && typeof m.sender_id === 'object') {
        json.sender = m.sender_id.toJSON ? m.sender_id.toJSON() : m.sender_id;
      }
      return json;
    }),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};
