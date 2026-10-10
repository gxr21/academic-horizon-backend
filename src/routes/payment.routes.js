import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { auditLog } from '../middlewares/logger.middleware.js';
import { uploadReceipt, RECEIPT_MAX_BYTES } from '../config/multer.js';
import { ROLES } from '../utils/constants.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { paymentDecisionSchema, paymentSettingsSchema } from '../validators/payment.validator.js';
import * as paymentService from '../services/payment.service.js';

const router = Router();

const fail = (res, error, fallback) =>
  sendError(res, error.code || fallback, error.message, error.statusCode || 500);

const checkId = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendError(res, 'INVALID_ID', 'Invalid order id', 400);
  }
  next();
};

/** Runs multer and turns its errors into normal JSON answers. */
const receiptUpload = (req, res, next) => {
  uploadReceipt.single('receipt')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 'FILE_TOO_LARGE', `حجم الصورة يجب ألا يتجاوز ${RECEIPT_MAX_BYTES / 1024 / 1024} ميغابايت`, 400);
    }
    return sendError(res, err.code || 'UPLOAD_FAILED', err.message, err.statusCode || 400);
  });
};

// Where to send the money
router.get('/info', authenticate, async (req, res) => {
  try {
    return sendSuccess(res, await paymentService.getPaymentInfo());
  } catch (error) {
    return fail(res, error, 'FETCH_FAILED');
  }
});

// Student uploads the transfer receipt
router.post(
  '/orders/:id/receipt',
  authenticate,
  authorize(ROLES.STUDENT),
  checkId,
  receiptUpload,
  async (req, res) => {
    try {
      const order = await paymentService.submitReceipt({
        orderId: req.params.id,
        studentId: req.user.id,
        file: req.file,
        channel: String(req.body?.channel || '').toLowerCase(),
      });
      return sendSuccess(res, { order }, 'تم استلام الإيصال، سنراجعه ونفعّل طلبك قريباً', 201);
    } catch (error) {
      return fail(res, error, 'RECEIPT_FAILED');
    }
  }
);

// The receipt picture (admin or the student who sent it)
router.get('/orders/:id/receipt', authenticate, checkId, async (req, res) => {
  try {
    const { data, mime } = await paymentService.getReceipt({
      orderId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
    res.set({
      'Content-Type': mime,
      'Content-Length': data.length,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    });
    return res.send(data);
  } catch (error) {
    return fail(res, error, 'FETCH_FAILED');
  }
});

router.get('/admin/queue', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const view = req.query.view === 'history' ? 'history' : 'review';
    const payments = await paymentService.listPayments(view);
    return sendSuccess(res, { payments });
  } catch (error) {
    return fail(res, error, 'FETCH_FAILED');
  }
});

router.patch(
  '/admin/orders/:id/decision',
  authenticate,
  authorize(ROLES.ADMIN),
  checkId,
  validate(paymentDecisionSchema),
  async (req, res) => {
    try {
      const order = await paymentService.decidePayment({
        orderId: req.params.id,
        decision: req.body.decision,
        note: req.body.note,
      });
      auditLog(req, 'ADMIN_PAYMENT_DECISION', { orderId: req.params.id, decision: req.body.decision });
      return sendSuccess(
        res,
        { order },
        req.body.decision === 'confirm' ? 'تم تأكيد الدفع وفُتح الطلب للمزودين' : 'تم رفض الإيصال'
      );
    } catch (error) {
      return fail(res, error, 'DECISION_FAILED');
    }
  }
);

router.get('/admin/settings', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    return sendSuccess(res, await paymentService.getPaymentInfo());
  } catch (error) {
    return fail(res, error, 'FETCH_FAILED');
  }
});

router.put(
  '/admin/settings',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(paymentSettingsSchema),
  async (req, res) => {
    try {
      const result = await paymentService.updatePaymentSettings(req.body);
      auditLog(req, 'ADMIN_UPDATE_PAYMENT_SETTINGS', { methods: result.methods.map((m) => m.id) });
      return sendSuccess(res, result, 'تم حفظ طرق الدفع');
    } catch (error) {
      return fail(res, error, 'UPDATE_FAILED');
    }
  }
);

export default router;
