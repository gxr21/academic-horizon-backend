import { Router } from 'express';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { validate } from '../middlewares/validate.middleware.js';
import { auditLog } from '../middlewares/logger.middleware.js';
import * as userService from '../services/user.service.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/role.middleware.js';
import { ROLES } from '../utils/constants.js';
import Order from '../models/Order.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import File from '../models/File.js';
import { sendSuccess, sendError, sendPaginated } from '../utils/response.js';
import Report from '../models/Report.js';
import * as reportService from '../services/report.service.js';
import * as profileChangeService from '../services/profileChange.service.js';
import { sendProviderWelcomeEmail, sendProviderDecisionEmail } from '../services/email.service.js';
import ProfileChangeRequest from '../models/ProfileChangeRequest.js';
import Withdrawal from '../models/Withdrawal.js';
import { getPlatformSettings } from '../services/wallet.service.js';
import { restrictUserSchema, reviewReportSchema } from '../validators/report.validator.js';

const router = Router();

/**
 * GET /api/admin/conversations
 * Admin only — get all conversations (orders with their messages).
 * Used by admin dashboard to monitor all chats.
 */
router.get('/conversations', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get all orders with pagination (admin sees all)
    const [orders, total] = await Promise.all([
      Order.find({})
        .populate('student_id', 'name email')
        .populate('provider_id', 'name email')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments({}),
    ]);

    // For each order, fetch messages (limited to last 10 for performance)
    const conversations = await Promise.all(
      orders.map(async (order) => {
        const messages = await Message.find({ order_id: order._id })
          .populate('sender_id', 'name email role')
          .sort({ created_at: -1 })
          .limit(10);

        return {
          orderId: order._id.toString(),
          orderDetails: {
            title: order.title,
            description: order.description,
            serviceType: order.service_type,
            price: order.price,
            status: order.status,
          },
          student: order.student_id ? {
            id: order.student_id._id.toString(),
            name: order.student_id.name,
            email: order.student_id.email,
          } : null,
          provider: order.provider_id ? {
            id: order.provider_id._id.toString(),
            name: order.provider_id.name,
            email: order.provider_id.email,
          } : null,
          messages: messages.map((msg) => ({
            id: msg._id.toString(),
            senderId: msg.sender_id._id.toString(),
            senderName: msg.sender_id.name,
            senderEmail: msg.sender_id.email,
            messageType: msg.message_type,
            createdAt: msg.created_at,
            // Note: encrypted_message is NOT sent to admin for privacy
            // Admin can see that a message exists but not content
          })),
          messageCount: await Message.countDocuments({ order_id: order._id }),
          lastMessageAt: messages.length > 0 ? messages[0].created_at : null,
        };
      })
    );

    return sendPaginated(res, conversations, {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Admin conversations fetch error:', error);
    return sendError(res, 'FETCH_FAILED', error.message, 500);
  }
});

/**
 * GET /api/admin/conversations/:orderId/messages
 * Admin only — read-only view of a student↔provider conversation, for safety review.
 *
 * Messages stay end-to-end encrypted on the server. For each message the client that sent it
 * also wrapped the AES key with the admin's public key, so this endpoint returns the ciphertext
 * plus THIS admin's wrapped key; decryption happens in the admin's browser with their private key.
 * Messages sent without any key (plain fallback) are flagged `isPlain`.
 * Every access is written to the audit log.
 */
router.get('/conversations/:orderId/messages', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      return sendError(res, 'INVALID_ID', `Invalid order id: ${orderId}`, 400);
    }

    const order = await Order.findById(orderId)
      .populate('student_id', 'name email')
      .populate('provider_id', 'name email');
    if (!order) return sendError(res, 'NOT_FOUND', 'Order not found', 404);

    const messages = await Message.find({ order_id: order._id })
      .populate('sender_id', 'name email role')
      .sort({ created_at: 1 })
      .limit(1000);

    auditLog(req, 'ADMIN_VIEW_CONVERSATION', { orderId, messageCount: messages.length });

    const data = messages.map((m) => {
      const mine = (m.admin_wrapped_keys || []).find((k) => k.admin_id.toString() === req.user.id);
      const hasAnyKey = !!(m.wrapped_key || m.sender_wrapped_key || (m.admin_wrapped_keys || []).length);
      return {
        id: m._id.toString(),
        senderId: m.sender_id?._id?.toString() || null,
        senderName: m.sender_id?.name || 'محذوف',
        senderRole: m.sender_id?.role || null,
        messageType: m.message_type,
        createdAt: m.created_at,
        encryptedMessage: m.encrypted_message,
        iv: m.iv,
        adminWrappedKey: mine ? mine.wrapped_key : null,
        isPlain: !hasAnyKey,
      };
    });

    return sendSuccess(res, {
      order: {
        id: order._id.toString(),
        title: order.title,
        status: order.status,
        student: order.student_id ? { id: order.student_id._id.toString(), name: order.student_id.name } : null,
        provider: order.provider_id ? { id: order.provider_id._id.toString(), name: order.provider_id.name } : null,
      },
      messages: data,
    });
  } catch (error) {
    console.error('Admin conversation messages error:', error);
    return sendError(res, 'FETCH_FAILED', error.message, 500);
  }
});

/**
 * GET /api/admin/orders
 * Admin only — get all orders with rich data for dashboard.
 */
router.get('/orders', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const { page = 1, status } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200);
    const query = {};
    if (status) {
      // Accepts a single status or a comma-separated list (e.g. "completed,delivered")
      const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
      query.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    const skip = (parseInt(page) - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('student_id', 'name email')
        .populate('provider_id', 'name email')
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query),
    ]);

    // Get file counts for all these orders in one query
    const orderIds = orders.map((o) => o._id);
    const filesAggregation = await File.aggregate([
      { $match: { order_id: { $in: orderIds } } },
      { $group: { _id: '$order_id', count: { $sum: 1 } } },
    ]);
    const fileCountMap = filesAggregation.reduce((acc, cur) => {
      acc[cur._id.toString()] = cur.count;
      return acc;
    }, {});

    const ordersWithMeta = await Promise.all(
      orders.map(async (order) => {
        const messagesCount = await Message.countDocuments({ order_id: order._id });
        const json = order.toJSON();
        json.messagesCount = messagesCount;
        json.filesCount = fileCountMap[order._id.toString()] || 0;
        return json;
      })
    );

    return sendPaginated(res, ordersWithMeta, {
      page: parseInt(page),
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Admin orders fetch error:', error);
    return sendError(res, 'FETCH_FAILED', error.message, 500);
  }
});

/**
 * GET /api/admin/stats
 * Admin only — real counts for the dashboard cards.
 *  - completedOrders: every order finished by a provider (awaiting review + approved/delivered)
 *  - awaitingReview : orders submitted by providers that the admin still has to verify
 */
router.get('/stats', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const [students, providers, statusRows, pendingReports, restrictedStudents, pendingProfileChanges, pendingWithdrawals, platform] = await Promise.all([
      User.countDocuments({ role: ROLES.STUDENT }),
      User.countDocuments({ role: ROLES.PROVIDER, approval_status: { $nin: ['pending', 'rejected'] } }),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Report.countDocuments({ status: 'pending' }),
      User.countDocuments({ role: ROLES.STUDENT, restriction_type: { $in: ['temporary', 'permanent'] } }),
      ProfileChangeRequest.countDocuments({ status: 'pending' }),
      Withdrawal.countDocuments({ status: 'pending' }),
      getPlatformSettings(),
    ]);

    const byStatus = statusRows.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});
    const get = (s) => byStatus[s] || 0;

    return sendSuccess(res, {
      students,
      providers,
      totalOrders: Object.values(byStatus).reduce((a, b) => a + b, 0),
      completedOrders: get('completed') + get('delivered'),
      awaitingReview: get('completed'),
      deliveredOrders: get('delivered'),
      pendingReports,
      restrictedStudents,
      pendingProfileChanges,
      pendingWithdrawals,
      platformBalance: platform.wallet_balance || 0,
      commissionPercent: platform.commission_percent,
      byStatus,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return sendError(res, 'FETCH_FAILED', error.message, 500);
  }
});

/**
 * GET /api/admin/users?role=student|provider&page=&limit=
 * Admin only — list users (no passwords).
 */
router.get('/users', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const { page = 1, role } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const result = await userService.getAllUsers({
      page: parseInt(page) || 1,
      limit,
      role: role || undefined,
    });
    return sendPaginated(res, result.users, result.pagination);
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
});

/**
 * POST /api/admin/providers
 * Admin only — create a service-provider account.
 */
const createProviderSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(3, 'Name must be at least 3 characters').max(50),
  email: z.string({ required_error: 'Email is required' }).trim().email('Please provide a valid email').toLowerCase(),
  password: z.string({ required_error: 'Password is required' }).min(6, 'Password must be at least 6 characters').max(128),
  phone: z.string({ required_error: 'Phone is required' }).trim().min(8, 'Phone is required').max(30),
  bio: z.string().trim().max(1000).optional().default(''),
});

router.post('/providers', authenticate, authorize(ROLES.ADMIN), validate(createProviderSchema), async (req, res) => {
  try {
    const { name, email, password, phone, bio } = req.body;
    if (await User.findOne({ email })) {
      return sendError(res, 'CONFLICT', 'This email is already registered', 409);
    }
    const provider = await User.create({
      name,
      email,
      password,
      phone: phone || '',
      bio: bio || '',
      role: ROLES.PROVIDER,
    });
    const emailResult = await sendProviderWelcomeEmail({ name, email, password });
    const message = emailResult.sent
      ? 'تم إنشاء المزود وإرسال رسالة الترحيب إلى بريده'
      : `تم إنشاء المزود، لكن الرسالة لم تُرسل: ${emailResult.reason || 'تعذر الإرسال عبر Resend'}`;
    return sendSuccess(res, { user: provider.toJSON(), emailSent: emailResult.sent }, message, 201);
  } catch (error) {
    return sendError(res, 'CREATE_FAILED', error.message, 500);
  }
});

/**
 * PATCH /api/admin/providers/:id/decision
 * Admin only — approve or reject a provider who signed up by themselves.
 */
const providerDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected'], {
    errorMap: () => ({ message: 'Status must be approved or rejected' }),
  }),
  note: z.string().trim().max(500).optional().default(''),
});

router.patch(
  '/providers/:id/decision',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(providerDecisionSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 'INVALID_ID', `Invalid user id: ${id}`, 400);
      }
      const provider = await User.findById(id);
      if (!provider || provider.role !== ROLES.PROVIDER) {
        return sendError(res, 'NOT_FOUND', 'Provider not found', 404);
      }
      if ((provider.approval_status || 'approved') === 'approved') {
        return sendError(res, 'ALREADY_APPROVED', 'هذا المزود معتمد بالفعل', 409);
      }
      if (!provider.email_verified) {
        return sendError(res, 'EMAIL_NOT_VERIFIED', 'لم يؤكد المزود بريده الإلكتروني بعد', 400);
      }

      const { status, note } = req.body;
      provider.approval_status = status;
      provider.approval_note = status === 'rejected' ? note : '';
      provider.approval_decided_at = new Date();
      await provider.save({ validateBeforeSave: false });

      const mail = await sendProviderDecisionEmail({
        name: provider.name,
        email: provider.email,
        approved: status === 'approved',
        note,
      });

      const label = status === 'approved' ? 'تمت الموافقة على المزود' : 'تم رفض طلب المزود';
      return sendSuccess(
        res,
        { user: provider.toJSON(), emailSent: mail.sent },
        mail.sent ? `${label} وأُبلغ عبر بريده` : `${label}، لكن تعذر إرسال البريد إليه`
      );
    } catch (error) {
      return sendError(res, 'DECISION_FAILED', error.message, 500);
    }
  }
);

const updateUserSchema = z.object({
  name: z.string().trim().min(3).max(50).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  phone: z.string().trim().max(30).optional(),
  bio: z.string().trim().max(1000).optional(),
});

router.patch(
  '/users/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(updateUserSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 'INVALID_ID', `Invalid user id: ${id}`, 400);
      }
      const user = await userService.adminUpdateUser(id, req.body);
      return sendSuccess(res, { user }, 'تم تحديث بيانات المستخدم');
    } catch (error) {
      return sendError(res, error.code || 'UPDATE_FAILED', error.message, error.statusCode || 500);
    }
  }
);

/**
 * DELETE /api/admin/users/:id
 * Admin only — delete a student/provider (cascades to their orders & messages).
 * Admin accounts cannot be deleted from here.
 */
router.delete('/users/:id', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return sendError(res, 'INVALID_ID', `Invalid user id: ${id}`, 400);
    }
    const target = await User.findById(id);
    if (!target) return sendError(res, 'NOT_FOUND', 'User not found', 404);
    if (target.role === ROLES.ADMIN) {
      return sendError(res, 'FORBIDDEN', 'Admin accounts cannot be deleted', 403);
    }
    await userService.deleteUser(id);
    return sendSuccess(res, { id }, 'User deleted successfully');
  } catch (error) {
    return sendError(res, error.code || 'DELETE_FAILED', error.message, error.statusCode || 500);
  }
});

/**
 * DELETE /api/admin/orders/:id
 * Admin only — permanently delete an order together with its messages and files.
 * Messages are removed by the Order `findOneAndDelete` hook; files (DB records
 * and uploaded files on disk) are removed here.
 */
router.delete('/orders/:id', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return sendError(res, 'INVALID_ID', `Invalid order id: ${id}`, 400);
    }

    const order = await Order.findById(id);
    if (!order) {
      return sendError(res, 'NOT_FOUND', 'Order not found', 404);
    }

    // Remove uploaded files (disk + DB records)
    const files = await File.find({ order_id: order._id });
    await Promise.all(
      files.map(async (f) => {
        try {
          await fs.promises.unlink(f.file_path);
        } catch (err) {
          // File may already be gone — don't block the deletion
          if (err.code !== 'ENOENT') console.warn('Could not delete file:', f.file_path, err.message);
        }
      })
    );
    await File.deleteMany({ order_id: order._id });

    // Triggers the hook that also deletes the order's messages
    await Order.findOneAndDelete({ _id: order._id });

    console.log(`🗑️  Admin ${req.user.email} deleted order ${id}`);
    return sendSuccess(res, { id }, 'Order deleted successfully');
  } catch (error) {
    console.error('Admin order delete error:', error);
    return sendError(res, 'DELETE_FAILED', error.message, 500);
  }
});

/**
 * GET /api/admin/reports
 * Admin only — list student reports from providers.
 */
router.get('/reports', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const { page = 1, status } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const result = await reportService.listReports({
      page: parseInt(page) || 1,
      limit,
      status: status || undefined,
    });
    return sendPaginated(res, result.reports, result.pagination);
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
});

/**
 * PATCH /api/admin/reports/:id
 * Admin only — dismiss or mark a report as reviewed.
 */
router.patch(
  '/reports/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(reviewReportSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 'INVALID_ID', `Invalid report id: ${id}`, 400);
      }
      const report = await reportService.reviewReport({
        reportId: id,
        adminId: req.user.id,
        status: req.body.status,
        adminNote: req.body.adminNote,
      });
      return sendSuccess(res, { report: report.toJSON() }, 'تم تحديث البلاغ');
    } catch (error) {
      return sendError(res, error.code || 'UPDATE_FAILED', error.message, error.statusCode || 500);
    }
  }
);

/**
 * PATCH /api/admin/users/:id/restrict
 * Admin only — temporarily restrict or permanently ban a student.
 */
router.patch(
  '/users/:id/restrict',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(restrictUserSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 'INVALID_ID', `Invalid user id: ${id}`, 400);
      }
      const user = await reportService.restrictStudent({
        adminId: req.user.id,
        userId: id,
        type: req.body.type,
        days: req.body.days,
        until: req.body.until,
        reason: req.body.reason,
        reportId: req.body.reportId,
      });
      auditLog(req, 'ADMIN_RESTRICT_USER', {
        userId: id,
        type: req.body.type,
        days: req.body.days,
      });
      return sendSuccess(res, { user: user.toJSON() }, 'تم تقييد حساب الطالب');
    } catch (error) {
      return sendError(res, error.code || 'RESTRICT_FAILED', error.message, error.statusCode || 500);
    }
  }
);

/**
 * PATCH /api/admin/users/:id/unrestrict
 * Admin only — lift a student restriction.
 */
router.patch('/users/:id/unrestrict', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return sendError(res, 'INVALID_ID', `Invalid user id: ${id}`, 400);
    }
    const user = await reportService.unrestrictStudent({ userId: id });
    auditLog(req, 'ADMIN_UNRESTRICT_USER', { userId: id });
    return sendSuccess(res, { user: user.toJSON() }, 'تم فك تقييد الحساب');
  } catch (error) {
    return sendError(res, error.code || 'UNRESTRICT_FAILED', error.message, error.statusCode || 500);
  }
});

/**
 * GET /api/admin/profile-changes
 */
router.get('/profile-changes', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const { page = 1, status } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const result = await profileChangeService.listAll({
      page: parseInt(page) || 1,
      limit,
      status: status || undefined,
    });
    return sendPaginated(res, result.requests, result.pagination);
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
});

const reviewProfileChangeSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  adminNote: z.string().trim().max(500).optional().default(''),
});

router.patch(
  '/profile-changes/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(reviewProfileChangeSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return sendError(res, 'INVALID_ID', `Invalid request id: ${id}`, 400);
      }
      const request = await profileChangeService.reviewRequest({
        requestId: id,
        adminId: req.user.id,
        status: req.body.status,
        adminNote: req.body.adminNote,
      });
      auditLog(req, 'ADMIN_REVIEW_PROFILE_CHANGE', { requestId: id, status: req.body.status });
      return sendSuccess(res, { request: request.toJSON() }, 'تم تحديث طلب التغيير');
    } catch (error) {
      return sendError(res, error.code || 'UPDATE_FAILED', error.message, error.statusCode || 500);
    }
  }
);

export default router;
