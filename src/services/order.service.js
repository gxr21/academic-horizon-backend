import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import File from '../models/File.js';
import Service from '../models/Service.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../utils/errors.js';
import {
  ROLES,
  ORDER_STATUS,
  STATUS_TRANSITIONS,
  SUBSCRIPTION_LIMITS,
  SUBSCRIPTION,
} from '../utils/constants.js';
import { notifyUsers, notifyRole } from './notification.service.js';
import { snapshotForPrice, settleDeliveredOrder } from './wallet.service.js';
import { PAID_STATUSES } from './payment.service.js';

/**
 * Create a new order (student only).
 * - Either from a catalog service ({ serviceId }) — title/price come from the service, or
 *   as a custom/package order ({ title, serviceType, price }).
 * - Checks subscription limits (expired subscription => treated as free).
 * - Notifies the student (confirmation) and every provider (new incoming order).
 */
export const createOrder = async (studentId, data) => {
  const student = await User.findById(studentId);
  if (!student) throw new NotFoundError('Student');

  // Determine effective subscription (downgrade if expired)
  let effectiveSubscription = student.subscription_type;
  if (student.subscription_expires_at && student.subscription_expires_at < new Date()) {
    effectiveSubscription = SUBSCRIPTION.FREE;
  }

  // Check subscription limits
  const activeOrders = await Order.countDocuments({
    student_id: studentId,
    status: { $nin: [ORDER_STATUS.COMPLETED, ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED] },
  });

  const limit = SUBSCRIPTION_LIMITS[effectiveSubscription] || SUBSCRIPTION_LIMITS.free;

  if (activeOrders >= limit) {
    throw new ValidationError(
      `You have reached the maximum number of active orders (${limit}) for your ${effectiveSubscription} plan. Please upgrade your subscription.`
    );
  }

  let { title, description, serviceType, price } = data;
  let serviceId = null;

  if (data.serviceId) {
    if (!mongoose.isValidObjectId(data.serviceId)) {
      throw new ValidationError('Invalid service id');
    }
    const service = await Service.findById(data.serviceId);
    if (!service || !service.is_active) throw new NotFoundError('Service');

    // Server is the source of truth for what the student is buying
    title = service.title;
    description = service.description;
    serviceType = service.service_type;
    price = service.price;
    serviceId = service._id;
  }

  const needsPayment = (price || 0) > 0;
  const snapshot = await snapshotForPrice(price || 0);
  const order = await Order.create({
    title,
    description,
    service_type: serviceType,
    price: price || 0,
    commission_rate: snapshot.rate,
    commission_amount: snapshot.commissionAmount,
    provider_amount: snapshot.providerAmount,
    notes: data.notes,
    service_id: serviceId,
    student_id: studentId,
    status: ORDER_STATUS.PENDING,
    // A priced order stays hidden from providers until the admin confirms the transfer.
    // Free ("price agreed in chat") orders have nothing to pay, so they open straight away.
    payment_status: needsPayment ? 'unpaid' : 'reserved',
    payment_method: needsPayment ? 'transfer' : 'none',
    payment_agreed_at: new Date(),
  });

  // Notifications (best effort — never block the order)
  if (needsPayment) {
    await notifyUsers([studentId], {
      type: 'order_created',
      title: 'أكمل الدفع لتفعيل طلبك',
      message: `تم إنشاء طلب "${order.title}" بمبلغ ${order.price} دينار. حوّل المبلغ ثم ارفع صورة الإيصال ليُفعَّل الطلب ويصل للمزودين.`,
      orderId: order._id,
    });
  } else {
    await Promise.all([
      notifyUsers([studentId], {
        type: 'order_created',
        title: 'تم إنشاء طلبك',
        message: `تم إنشاء "${order.title}" وهو بانتظار قبول مزود الخدمة.`,
        orderId: order._id,
      }),
      notifyRole(ROLES.PROVIDER, {
        type: 'new_order',
        title: 'طلب جديد',
        message: `طلب جديد من ${student.name}: ${order.title}`,
        orderId: order._id,
      }),
    ]);
  }

  return order.toJSON();
};

/**
 * Count uploaded files per order id → { orderId: count }
 */
const getFileCounts = async (orderIds) => {
  if (!orderIds.length) return {};
  const rows = await File.aggregate([
    { $match: { order_id: { $in: orderIds } } },
    { $group: { _id: '$order_id', count: { $sum: 1 } } },
  ]);
  return rows.reduce((acc, r) => {
    acc[r._id.toString()] = r.count;
    return acc;
  }, {});
};

/**
 * Get orders filtered by role.
 * - student  → own orders
 * - provider → incoming orders (pending & unassigned) + orders assigned to the provider.
 *              `scope`: 'available' (incoming only) | 'mine' (assigned to me only)
 * - admin    → everything. `status` may be a comma-separated list.
 * Includes messagesCount, filesCount and lastMessageAt for each order.
 */
export const getOrders = async (userId, role, { page = 1, limit = 10, status, scope } = {}) => {
  const query = {};

  if (role === ROLES.STUDENT) {
    query.student_id = userId;
  } else if (role === ROLES.PROVIDER) {
    // Providers only ever see incoming orders whose payment the admin has confirmed
    if (scope === 'available') {
      query.status = ORDER_STATUS.PENDING;
      query.provider_id = null;
      query.payment_status = { $in: PAID_STATUSES };
    } else if (scope === 'mine') {
      query.provider_id = userId;
    } else {
      query.$or = [
        { provider_id: userId },
        { status: ORDER_STATUS.PENDING, provider_id: null, payment_status: { $in: PAID_STATUSES } },
      ];
    }
  }
  // Admin sees all

  if (status) {
    const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
    query.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }

  limit = Math.min(Math.max(parseInt(limit) || 10, 1), 200);
  page = Math.max(parseInt(page) || 1, 1);
  const skip = (page - 1) * limit;

  // Fetch orders with pagination
  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate('student_id', 'name email')
      .populate('provider_id', 'name email')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(query),
  ]);

  const fileCounts = await getFileCounts(orders.map((o) => o._id));

  // Enrich orders with message metadata (non-E2EE safe: just counts/timestamps)
  const ordersWithMeta = await Promise.all(
    orders.map(async (order) => {
      const [messagesCount, lastMessage] = await Promise.all([
        Message.countDocuments({ order_id: order._id }),
        Message.findOne({ order_id: order._id }).sort({ created_at: -1 }),
      ]);

      const json = order.toJSON();
      json.messagesCount = messagesCount;
      json.filesCount = fileCounts[order._id.toString()] || 0;
      json.lastMessageAt = lastMessage ? lastMessage.created_at : null;

      // Add nested populated user objects
      if (order.student_id && typeof order.student_id === 'object') {
        json.student = order.student_id.toJSON ? order.student_id.toJSON() : order.student_id;
      }
      if (order.provider_id && typeof order.provider_id === 'object') {
        json.provider = order.provider_id.toJSON ? order.provider_id.toJSON() : order.provider_id;
      }
      return json;
    })
  );

  return {
    orders: ordersWithMeta,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get single order by ID (with access control).
 * Includes messagesCount, filesCount and lastMessageAt.
 */
export const getOrderById = async (orderId, userId, role) => {
  const order = await Order.findById(orderId)
    .populate('student_id', 'name email')
    .populate('provider_id', 'name email');

  if (!order) throw new NotFoundError('Order');

  // Access control: only participants or admin
  if (role !== ROLES.ADMIN) {
    const isStudent = order.student_id._id.toString() === userId;
    const isProvider = order.provider_id && order.provider_id._id.toString() === userId;
    if (!isStudent && !isProvider) {
      throw new ForbiddenError('You do not have access to this order');
    }
  }

  // Get message metadata
  const [messagesCount, filesCount, lastMessage] = await Promise.all([
    Message.countDocuments({ order_id: order._id }),
    File.countDocuments({ order_id: order._id }),
    Message.findOne({ order_id: order._id }).sort({ created_at: -1 }),
  ]);

  const json = order.toJSON();
  json.messagesCount = messagesCount;
  json.filesCount = filesCount;
  json.lastMessageAt = lastMessage ? lastMessage.created_at : null;

  if (order.student_id && typeof order.student_id === 'object') {
    json.student = order.student_id.toJSON ? order.student_id.toJSON() : order.student_id;
  }
  if (order.provider_id && typeof order.provider_id === 'object') {
    json.provider = order.provider_id.toJSON ? order.provider_id.toJSON() : order.provider_id;
  }
  return json;
};

/**
 * A provider accepts an incoming order (pending & unassigned).
 * Atomic: if two providers click at the same time, only one wins.
 */
export const acceptOrder = async (orderId, providerId) => {
  const provider = await User.findById(providerId);
  if (!provider || provider.role !== ROLES.PROVIDER) {
    throw new ForbiddenError('Only providers can accept orders');
  }

  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: ORDER_STATUS.PENDING,
      provider_id: null,
      payment_status: { $in: PAID_STATUSES },
    },
    { provider_id: providerId, status: ORDER_STATUS.IN_PROGRESS },
    { new: true }
  );

  if (!order) {
    const exists = await Order.findById(orderId);
    if (!exists) throw new NotFoundError('Order');
    if (!PAID_STATUSES.includes(exists.payment_status)) {
      throw new ConflictError('This order is not available yet');
    }
    throw new ConflictError('This order was already taken or is no longer available');
  }

  await notifyUsers([order.student_id], {
    type: 'order_accepted',
    title: 'تم قبول طلبك',
    message: `قبل مزود الخدمة ${provider.name} طلبك "${order.title}" وبدأ العمل عليه. يمكنك التواصل معه من صفحة المحادثة.`,
    orderId: order._id,
  });

  return order.toJSON();
};

/**
 * Update order status with lifecycle validation, role rules and notifications.
 *
 * Roles:
 *  - provider: start work (assigned → in_progress) and submit for review (in_progress → completed)
 *  - student : cancel only
 *  - admin   : approve (completed → delivered) / send back (completed → in_progress, with a note) / any valid transition
 */
export const updateOrderStatus = async (orderId, newStatus, userId, role, note = '') => {
  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order');

  const isOwnerStudent = order.student_id.toString() === userId;
  const isOwnerProvider = order.provider_id && order.provider_id.toString() === userId;

  // Validate access
  if (role === ROLES.PROVIDER) {
    if (!isOwnerProvider) {
      throw new ForbiddenError('You are not the assigned provider');
    }
    if (newStatus !== ORDER_STATUS.IN_PROGRESS && newStatus !== ORDER_STATUS.COMPLETED) {
      throw new ForbiddenError('Providers can only start work or submit the order for review');
    }
  } else if (role === ROLES.STUDENT) {
    if (!isOwnerStudent) {
      throw new ForbiddenError('Not your order');
    }
    if (newStatus !== ORDER_STATUS.CANCELLED) {
      throw new ForbiddenError('Students can only cancel their orders');
    }
  } else if (role !== ROLES.ADMIN) {
    throw new ForbiddenError('Access denied');
  }

  // Validate transition
  const previousStatus = order.status;
  const allowedTransitions = STATUS_TRANSITIONS[previousStatus];
  if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
    throw new ValidationError(
      `Cannot transition from "${previousStatus}" to "${newStatus}"`
    );
  }

  // Work cannot start on an order whose money the platform has not received
  if (
    previousStatus === ORDER_STATUS.PENDING &&
    newStatus !== ORDER_STATUS.CANCELLED &&
    !PAID_STATUSES.includes(order.payment_status)
  ) {
    throw new ValidationError('لا يمكن بدء الطلب قبل تأكيد الدفع');
  }

  order.status = newStatus;
  const refundDue =
    newStatus === ORDER_STATUS.CANCELLED && PAID_STATUSES.includes(order.payment_status);
  if (previousStatus === ORDER_STATUS.COMPLETED && newStatus === ORDER_STATUS.IN_PROGRESS) {
    order.review_note = note || ''; // admin sent the order back to the provider
  } else if (newStatus === ORDER_STATUS.DELIVERED) {
    order.review_note = '';
  }
  await order.save();

  if (refundDue) {
    // The student already paid: the admin has to send the money back by hand
    await notifyRole(ROLES.ADMIN, {
      type: 'refund_due',
      title: 'طلب مدفوع أُلغي — استرجاع مطلوب',
      message: `أُلغي الطلب "${order.title}" بعد دفع ${order.price || 0} دينار (رمز ${order._id.toString().slice(-6).toUpperCase()}). أعد المبلغ للطالب.`,
      orderId: order._id,
    });
  }

  if (newStatus === ORDER_STATUS.DELIVERED) {
    await settleDeliveredOrder(order);
    const fresh = await Order.findById(order._id);
    await sendStatusNotifications(fresh || order, previousStatus, newStatus, role, note);
    return (fresh || order).toJSON();
  }

  await sendStatusNotifications(order, previousStatus, newStatus, role, note);

  return order.toJSON();
};

/**
 * Notify the right people about a status change.
 */
const sendStatusNotifications = async (order, previousStatus, newStatus, actorRole, note) => {
  const studentId = order.student_id;
  const providerId = order.provider_id;
  const title = order.title;

  if (newStatus === ORDER_STATUS.IN_PROGRESS && previousStatus === ORDER_STATUS.ASSIGNED) {
    await notifyUsers([studentId], {
      type: 'order_started',
      title: 'بدأ العمل على طلبك',
      message: `بدأ مزود الخدمة العمل على طلبك "${title}".`,
      orderId: order._id,
    });
  } else if (newStatus === ORDER_STATUS.IN_PROGRESS && previousStatus === ORDER_STATUS.COMPLETED) {
    // Admin rejected the submission
    await notifyUsers([providerId], {
      type: 'order_rejected',
      title: 'أُعيد الطلب للتعديل',
      message: `أعاد الأدمن الطلب "${title}" للتعديل${note ? `: ${note}` : '.'}`,
      orderId: order._id,
    });
  } else if (newStatus === ORDER_STATUS.COMPLETED) {
    // Provider submitted the order for admin verification
    await Promise.all([
      notifyRole(ROLES.ADMIN, {
        type: 'order_submitted',
        title: 'طلب بانتظار المراجعة',
        message: `أرسل المزود الطلب "${title}" للتحقق منه واعتماده.`,
        orderId: order._id,
      }),
      notifyUsers([studentId], {
        type: 'order_completed',
        title: 'اكتمل تنفيذ طلبك',
        message: `أنهى مزود الخدمة طلبك "${title}" وهو الآن قيد المراجعة من الإدارة قبل التسليم.`,
        orderId: order._id,
      }),
    ]);
  } else if (newStatus === ORDER_STATUS.DELIVERED) {
    await Promise.all([
      notifyUsers([studentId], {
        type: 'order_delivered',
        title: 'تم تسليم طلبك',
        message: `تم اعتماد طلبك "${title}". يمكنك الآن تحميل الملفات من صفحة المحادثة.`,
        orderId: order._id,
      }),
      notifyUsers([providerId], {
        type: 'order_approved',
        title: 'تم اعتماد الطلب',
        message: `اعتمد الأدمن الطلب "${title}" وتم تسليمه للطالب. أُضيف ${order.provider_amount || 0} دينار إلى محفظتك بعد خصم عمولة المنصة.`,
        orderId: order._id,
      }),
    ]);
  } else if (newStatus === ORDER_STATUS.CANCELLED) {
    const targets = actorRole === ROLES.ADMIN ? [studentId, providerId] : [providerId];
    await notifyUsers(targets, {
      type: 'order_cancelled',
      title: 'تم إلغاء الطلب',
      message: `تم إلغاء الطلب "${title}".`,
      orderId: order._id,
    });
  }
};

/**
 * Assign a provider to an order (admin only).
 */
export const assignProvider = async (orderId, providerId) => {
  const [order, provider] = await Promise.all([
    Order.findById(orderId),
    User.findById(providerId),
  ]);

  if (!order) throw new NotFoundError('Order');
  if (!provider) throw new NotFoundError('Provider');
  if (provider.role !== ROLES.PROVIDER) {
    throw new ValidationError('User is not a provider');
  }
  if (!PAID_STATUSES.includes(order.payment_status)) {
    throw new ValidationError('لا يمكن تعيين مزود قبل تأكيد دفع الطلب');
  }

  order.provider_id = providerId;
  order.status = ORDER_STATUS.ASSIGNED;
  await order.save();

  await Promise.all([
    notifyUsers([providerId], {
      type: 'order_assigned',
      title: 'تم تعيين طلب لك',
      message: `عيّن الأدمن لك الطلب "${order.title}".`,
      orderId: order._id,
    }),
    notifyUsers([order.student_id], {
      type: 'order_accepted',
      title: 'تم تعيين مزود لطلبك',
      message: `تم تعيين مزود الخدمة ${provider.name} لطلبك "${order.title}".`,
      orderId: order._id,
    }),
  ]);

  return order.toJSON();
};
