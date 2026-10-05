import Report from '../models/Report.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../utils/errors.js';
import { ROLES, ORDER_STATUS } from '../utils/constants.js';
import { notifyRole, notifyUsers } from './notification.service.js';
import { disconnectUserSockets } from '../sockets/io.js';
import { RESTRICTION, evaluateRestriction, restrictionMessage } from '../utils/restriction.js';

const ACTIVE_ORDER_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.IN_PROGRESS,
];

const populateReport = (query) =>
  query
    .populate('reporter_id', 'name email role')
    .populate('reported_id', 'name email role restriction_type restriction_until restriction_reason')
    .populate('order_id', 'title status');

/**
 * Provider reports the student assigned to one of their orders.
 */
export const createReport = async ({ reporterId, orderId, reason, details }) => {
  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order');

  if (!order.provider_id || order.provider_id.toString() !== reporterId.toString()) {
    throw new ForbiddenError('يمكنك الإبلاغ فقط عن طالب في طلب معيّن لك');
  }
  if (!order.student_id) {
    throw new ValidationError('لا يوجد طالب مرتبط بهذا الطلب');
  }

  const existing = await Report.findOne({
    reporter_id: reporterId,
    order_id: orderId,
    status: 'pending',
  });
  if (existing) {
    throw new ConflictError('لديك بلاغ قيد المراجعة على هذا الطلب');
  }

  const report = await Report.create({
    reporter_id: reporterId,
    reported_id: order.student_id,
    order_id: order._id,
    reason,
    details,
  });

  const student = await User.findById(order.student_id).select('name');
  await notifyRole(ROLES.ADMIN, {
    type: 'student_report',
    title: 'بلاغ عن طالب مشاغب',
    message: `أبلغ مزود الخدمة عن الطالب ${student?.name || ''} في الطلب "${order.title}".`,
    orderId: order._id,
  });

  return populateReport(Report.findById(report._id));
};

export const getProviderReportForOrder = async (reporterId, orderId) => {
  const report = await Report.findOne({
    reporter_id: reporterId,
    order_id: orderId,
  }).sort({ created_at: -1 });
  return report ? report.toJSON() : null;
};

export const listReports = async ({ page = 1, limit = 50, status } = {}) => {
  const query = {};
  if (status) query.status = status;
  const skip = (page - 1) * limit;
  const [reports, total] = await Promise.all([
    populateReport(Report.find(query)).sort({ created_at: -1 }).skip(skip).limit(limit),
    Report.countDocuments(query),
  ]);
  return {
    reports: reports.map((r) => r.toJSON()),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
};

export const reviewReport = async ({ reportId, adminId, status, adminNote = '' }) => {
  const report = await Report.findById(reportId);
  if (!report) throw new NotFoundError('Report');
  report.status = status;
  report.admin_note = adminNote;
  report.reviewed_by = adminId;
  report.reviewed_at = new Date();
  await report.save();
  return populateReport(Report.findById(report._id));
};

export const restrictStudent = async ({
  adminId,
  userId,
  type,
  days,
  until,
  reason = '',
  reportId,
}) => {
  const target = await User.findById(userId);
  if (!target) throw new NotFoundError('User');
  if (target.role !== ROLES.STUDENT) {
    throw new ForbiddenError('يمكن تقييد حسابات الطلاب فقط');
  }

  if (type === RESTRICTION.PERMANENT) {
    target.restriction_type = RESTRICTION.PERMANENT;
    target.restriction_until = null;
  } else {
    const untilDate = until
      ? new Date(until)
      : new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);
    if (Number.isNaN(untilDate.getTime()) || untilDate <= new Date()) {
      throw new ValidationError('تاريخ انتهاء التقييد يجب أن يكون في المستقبل');
    }
    target.restriction_type = RESTRICTION.TEMPORARY;
    target.restriction_until = untilDate;
  }

  target.restriction_reason = reason || '';
  target.restricted_by = adminId;
  target.restricted_at = new Date();
  await target.save();

  if (reportId) {
    await Report.findByIdAndUpdate(reportId, {
      status: 'actioned',
      reviewed_by: adminId,
      reviewed_at: new Date(),
      admin_note: reason || 'تم تقييد الحساب بناءً على البلاغ',
    });
  }

  if (type === RESTRICTION.PERMANENT) {
    const activeOrders = await Order.find({
      student_id: target._id,
      status: { $in: ACTIVE_ORDER_STATUSES },
    });
    if (activeOrders.length > 0) {
      await Order.updateMany(
        { _id: { $in: activeOrders.map((o) => o._id) } },
        { $set: { status: ORDER_STATUS.CANCELLED } }
      );
      for (const order of activeOrders) {
        if (order.provider_id) {
          await notifyUsers([order.provider_id], {
            type: 'order_cancelled',
            title: 'أُلغي الطلب',
            message: `أُلغي الطلب "${order.title}" بسبب حظر حساب الطالب.`,
            orderId: order._id,
          });
        }
      }
    }
  }

  const status = await evaluateRestriction(target);
  await disconnectUserSockets(target._id, restrictionMessage(status));

  return target;
};

export const unrestrictStudent = async ({ userId }) => {
  const target = await User.findById(userId);
  if (!target) throw new NotFoundError('User');
  target.restriction_type = RESTRICTION.NONE;
  target.restriction_until = null;
  target.restriction_reason = '';
  target.restricted_by = null;
  target.restricted_at = null;
  await target.save();
  return target;
};
