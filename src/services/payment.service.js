import crypto from 'node:crypto';
import Order from '../models/Order.js';
import PlatformSettings from '../models/PlatformSettings.js';
import { getPlatformSettings } from './wallet.service.js';
import { notifyUsers, notifyRole } from './notification.service.js';
import { ROLES, ORDER_STATUS } from '../utils/constants.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../utils/errors.js';

/** Payment states that mean "the money reached the platform". */
export const PAID_STATUSES = ['reserved', 'collected'];

const RECEIPT_FIELDS = '+receipt_data +receipt_hash';

/** Real image type from the first bytes (the browser-sent mime type can be faked). */
const sniffImageType = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
};

/**
 * Where to send the money (shown to students).
 */
export const getPaymentInfo = async () => {
  const settings = await getPlatformSettings();
  const json = settings.toJSON();
  return {
    methods: (json.paymentMethods || []).filter((m) => m.id && m.label && m.account),
    instructions: json.paymentInstructions || '',
  };
};

/**
 * Admin: read / replace the payment methods students see.
 */
export const updatePaymentSettings = async ({ methods, instructions }) => {
  await getPlatformSettings();
  const settings = await PlatformSettings.findOneAndUpdate(
    { key: 'default' },
    { payment_methods: methods, payment_instructions: instructions || '' },
    { new: true }
  );
  const json = settings.toJSON();
  return { methods: json.paymentMethods, instructions: json.paymentInstructions };
};

/**
 * Student: attach the transfer receipt to one of their unpaid orders.
 */
export const submitReceipt = async ({ orderId, studentId, file, channel }) => {
  if (!file?.buffer) throw new ValidationError('ارفع صورة الإيصال');

  const order = await Order.findById(orderId).select(RECEIPT_FIELDS);
  if (!order) throw new NotFoundError('Order');
  if (order.student_id.toString() !== studentId) throw new ForbiddenError('Not your order');
  if (order.status !== ORDER_STATUS.PENDING) {
    throw new ValidationError('لا يمكن الدفع لهذا الطلب في حالته الحالية');
  }
  if (PAID_STATUSES.includes(order.payment_status)) {
    throw new ConflictError('تم تأكيد دفع هذا الطلب بالفعل');
  }

  const info = await getPaymentInfo();
  if (info.methods.length === 0) {
    throw new ValidationError('لم تُضبط طرق الدفع بعد. تواصل مع الإدارة.');
  }
  const method = info.methods.find((m) => m.id === channel);
  if (!method) throw new ValidationError('اختر طريقة الدفع التي حوّلت عبرها');

  const realType = sniffImageType(file.buffer);
  if (!realType) throw new ValidationError('الملف ليس صورة صالحة (JPG أو PNG أو WEBP)');

  // The same screenshot must not pay for two orders
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const duplicate = await Order.findOne({ receipt_hash: hash, _id: { $ne: order._id } }).select('_id');
  if (duplicate) {
    throw new ConflictError('هذا الإيصال مستخدم لطلب آخر. ارفع إيصال هذا التحويل.');
  }

  order.receipt_data = file.buffer;
  order.receipt_mime = realType;
  order.receipt_size = file.buffer.length;
  order.receipt_hash = hash;
  order.receipt_uploaded_at = new Date();
  order.payment_status = 'review';
  order.payment_method = 'transfer';
  order.payment_channel = method.id;
  order.payment_agreed_at = order.payment_agreed_at || new Date();
  order.payment_note = '';
  await order.save();

  await notifyRole(ROLES.ADMIN, {
    type: 'payment_receipt',
    title: 'إيصال دفع جديد',
    message: `رفع الطالب إيصال تحويل ${order.price || 0} دينار عبر ${method.label} للطلب "${order.title}" (رمز ${order.id.slice(-6).toUpperCase()}).`,
    orderId: order._id,
  });

  return order.toJSON();
};

/**
 * Admin: receipts waiting for a decision (`review`) or the latest decided ones (`history`).
 */
export const listPayments = async (view = 'review') => {
  const query =
    view === 'history'
      ? { payment_status: { $in: PAID_STATUSES }, receipt_mime: { $ne: '' }, payment_method: 'transfer' }
      : { payment_status: 'review' };

  const orders = await Order.find(query)
    .populate('student_id', 'name email')
    .sort(view === 'history' ? { payment_confirmed_at: -1 } : { receipt_uploaded_at: 1 })
    .limit(view === 'history' ? 30 : 200);

  return orders.map((order) => {
    const json = order.toJSON();
    if (order.student_id && typeof order.student_id === 'object') {
      json.student = order.student_id.toJSON();
    }
    return json;
  });
};

export const countPendingPayments = () => Order.countDocuments({ payment_status: 'review' });

/**
 * The receipt picture. Only the admin and the student who uploaded it may open it.
 */
export const getReceipt = async ({ orderId, userId, role }) => {
  const order = await Order.findById(orderId).select('+receipt_data student_id receipt_mime');
  if (!order || !order.receipt_data) throw new NotFoundError('Receipt');
  if (role !== ROLES.ADMIN && order.student_id.toString() !== userId) {
    throw new ForbiddenError('Access denied');
  }
  return { data: order.receipt_data, mime: order.receipt_mime || 'image/jpeg' };
};

/**
 * Admin: the money arrived (confirm) or the receipt is not acceptable (reject).
 * Confirming is what opens the order to providers.
 */
export const decidePayment = async ({ orderId, decision, note = '' }) => {
  const order = await Order.findById(orderId).select(RECEIPT_FIELDS);
  if (!order) throw new NotFoundError('Order');
  if (order.payment_status !== 'review') {
    throw new ConflictError('هذا الطلب ليس بانتظار مراجعة دفع');
  }

  if (decision === 'confirm') {
    order.payment_status = 'reserved';
    order.payment_confirmed_at = new Date();
    order.payment_note = '';
    await order.save();

    await Promise.all([
      notifyUsers([order.student_id], {
        type: 'payment_confirmed',
        title: 'تم تأكيد دفعك',
        message: `استلمنا مبلغ طلبك "${order.title}". الطلب الآن متاح للمزودين، وسنخبرك فور قبوله.`,
        orderId: order._id,
      }),
      notifyRole(ROLES.PROVIDER, {
        type: 'new_order',
        title: 'طلب جديد',
        message: `طلب جديد: ${order.title}`,
        orderId: order._id,
      }),
    ]);
  } else {
    order.payment_status = 'unpaid';
    order.payment_note = note || 'تعذر التحقق من التحويل';
    // Free the picture and its fingerprint so the student can send the right one
    order.receipt_data = undefined;
    order.receipt_hash = undefined;
    order.receipt_mime = '';
    order.receipt_size = 0;
    order.receipt_uploaded_at = null;
    await order.save();

    await notifyUsers([order.student_id], {
      type: 'payment_rejected',
      title: 'لم يُقبل إيصال الدفع',
      message: `لم نتمكن من تأكيد دفع الطلب "${order.title}". السبب: ${order.payment_note}. ارفع إيصالاً صحيحاً من صفحة الطلب.`,
      orderId: order._id,
    });
  }

  return order.toJSON();
};
