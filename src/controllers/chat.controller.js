import * as chatService from '../services/chat.service.js';
import User from '../models/User.js';
import { sendSuccess, sendError, sendPaginated } from '../utils/response.js';

/**
 * GET /api/chat/admin-keys
 * Public keys of the admins (only those who already registered one).
 * Clients wrap every message's AES key with these so admins can review
 * conversations for safety. Public keys are not secret.
 */
export const getAdminKeys = async (req, res) => {
  try {
    const admins = await User.find({
      role: 'admin',
      is_active: { $ne: false },
      public_key: { $ne: null },
    }).select('_id public_key');

    return sendSuccess(res, {
      keys: admins.map((a) => ({ adminId: a._id.toString(), publicKey: a.public_key })),
    });
  } catch (error) {
    return sendError(res, 'FETCH_FAILED', error.message, 500);
  }
};

/**
 * GET /api/chat/rooms/:order_id?page=1&limit=20
 */
export const getMessages = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await chatService.getMessageHistory(
      req.params.order_id,
      req.user.id,
      { page: parseInt(page), limit: parseInt(limit) }
    );
    return sendPaginated(res, result.messages, result.pagination);
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
};

/**
 * POST /api/chat/rooms/:order_id/messages
 */
export const sendMessage = async (req, res) => {
  try {
    const message = await chatService.saveMessage(
      req.params.order_id,
      req.user.id,
      req.body
    );
    return sendSuccess(res, { message }, 'Message sent', 201);
  } catch (error) {
    return sendError(res, error.code || 'SEND_FAILED', error.message, error.statusCode || 500);
  }
};
