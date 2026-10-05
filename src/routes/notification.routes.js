import { Router } from 'express';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();

router.use(authenticate);

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return sendError(res, 'INVALID_ID', `Invalid notification id: ${id}`, 400);
  }
  next();
});

/**
 * GET /api/notifications — latest notifications of the current user
 */
router.get('/', async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ user_id: req.user.id }).sort({ created_at: -1 }).limit(50),
      Notification.countDocuments({ user_id: req.user.id, read: false }),
    ]);
    return sendSuccess(res, {
      notifications: notifications.map((n) => n.toJSON()),
      unreadCount,
    });
  } catch (error) {
    return sendError(res, 'FETCH_FAILED', error.message, 500);
  }
});

/**
 * PATCH /api/notifications/read-all — mark everything as read
 */
router.patch('/read-all', async (req, res) => {
  try {
    await Notification.updateMany({ user_id: req.user.id, read: false }, { read: true });
    return sendSuccess(res, {}, 'All notifications marked as read');
  } catch (error) {
    return sendError(res, 'UPDATE_FAILED', error.message, 500);
  }
});

/**
 * PATCH /api/notifications/:id/read
 */
router.patch('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notification) return sendError(res, 'NOT_FOUND', 'Notification not found', 404);
    return sendSuccess(res, { notification: notification.toJSON() });
  } catch (error) {
    return sendError(res, 'UPDATE_FAILED', error.message, 500);
  }
});

/**
 * DELETE /api/notifications — clear all notifications of the current user
 */
router.delete('/', async (req, res) => {
  try {
    await Notification.deleteMany({ user_id: req.user.id });
    return sendSuccess(res, {}, 'Notifications cleared');
  } catch (error) {
    return sendError(res, 'DELETE_FAILED', error.message, 500);
  }
});

/**
 * DELETE /api/notifications/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    await Notification.deleteOne({ _id: req.params.id, user_id: req.user.id });
    return sendSuccess(res, {}, 'Notification deleted');
  } catch (error) {
    return sendError(res, 'DELETE_FAILED', error.message, 500);
  }
});

export default router;
