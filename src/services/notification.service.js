import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { getIO } from '../sockets/io.js';

/**
 * Create notifications for the given users and push them in real time.
 * Never throws — a notification failure must not break the main action.
 *
 * @param {Array<string|ObjectId>} userIds
 * @param {{type: string, title: string, message?: string, orderId?: any, serviceId?: any}} payload
 */
export const notifyUsers = async (userIds, { type, title, message = '', orderId = null, serviceId = null }) => {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean).map((id) => id.toString()))];
    if (ids.length === 0) return [];

    const docs = await Notification.insertMany(
      ids.map((id) => ({
        user_id: id,
        type,
        title,
        message,
        order_id: orderId,
        service_id: serviceId,
      }))
    );

    const io = getIO();
    if (io) {
      for (const doc of docs) {
        io.to(`user:${doc.user_id.toString()}`).emit('notification', doc.toJSON());
      }
    }

    return docs;
  } catch (error) {
    console.error('notifyUsers failed:', error.message);
    return [];
  }
};

/**
 * Notify every active user with the given role (optionally excluding some users).
 */
export const notifyRole = async (role, payload, excludeUserIds = []) => {
  try {
    const exclude = new Set(excludeUserIds.filter(Boolean).map((id) => id.toString()));
    const users = await User.find({ role, is_active: { $ne: false } }).select('_id');
    const ids = users.map((u) => u._id.toString()).filter((id) => !exclude.has(id));
    return await notifyUsers(ids, payload);
  } catch (error) {
    console.error('notifyRole failed:', error.message);
    return [];
  }
};
