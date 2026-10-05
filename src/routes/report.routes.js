import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { ROLES } from '../utils/constants.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { createReportSchema } from '../validators/report.validator.js';
import * as reportService from '../services/report.service.js';

const router = Router();

router.use(authenticate);

/**
 * POST /api/reports
 * Provider reports the student of an assigned order to the admin.
 */
router.post(
  '/',
  authorize(ROLES.PROVIDER),
  validate(createReportSchema),
  async (req, res) => {
    try {
      const report = await reportService.createReport({
        reporterId: req.user.id,
        orderId: req.body.orderId,
        reason: req.body.reason,
        details: req.body.details,
      });
      return sendSuccess(res, { report: report.toJSON() }, 'تم إرسال البلاغ إلى الإدارة', 201);
    } catch (error) {
      return sendError(res, error.code || 'REPORT_FAILED', error.message, error.statusCode || 500);
    }
  }
);

/**
 * GET /api/reports/order/:orderId
 * Provider — whether this conversation already has a report.
 */
router.get('/order/:orderId', authorize(ROLES.PROVIDER), async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      return sendError(res, 'INVALID_ID', `Invalid order id: ${orderId}`, 400);
    }
    const report = await reportService.getProviderReportForOrder(req.user.id, orderId);
    return sendSuccess(res, { report, alreadyReported: !!report });
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
});

export default router;
