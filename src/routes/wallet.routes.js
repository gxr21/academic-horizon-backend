import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { auditLog } from '../middlewares/logger.middleware.js';
import { ROLES } from '../utils/constants.js';
import { sendSuccess, sendError } from '../utils/response.js';
import {
  withdrawalRequestSchema,
  reviewWithdrawalSchema,
  commissionSchema,
} from '../validators/wallet.validator.js';
import * as walletService from '../services/wallet.service.js';

const router = Router();

router.get('/me', authenticate, authorize(ROLES.PROVIDER), async (req, res) => {
  try {
    const wallet = await walletService.getProviderWallet(req.user.id);
    return sendSuccess(res, wallet);
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
});

router.post(
  '/withdrawals',
  authenticate,
  authorize(ROLES.PROVIDER),
  validate(withdrawalRequestSchema),
  async (req, res) => {
    try {
      const withdrawal = await walletService.requestMastercardWithdrawal(req.user.id, req.body);
      return sendSuccess(res, { withdrawal }, 'تم إرسال طلب السحب إلى الإدارة', 201);
    } catch (error) {
      return sendError(res, error.code || 'WITHDRAW_FAILED', error.message, error.statusCode || 500);
    }
  }
);

router.get('/admin', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const finance = await walletService.getAdminFinance();
    return sendSuccess(res, finance);
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
});

router.patch(
  '/admin/commission',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(commissionSchema),
  async (req, res) => {
    try {
      const settings = await walletService.updateCommissionPercent(req.body.commissionPercent);
      auditLog(req, 'ADMIN_UPDATE_COMMISSION', { commissionPercent: req.body.commissionPercent });
      return sendSuccess(res, { settings }, 'تم تحديث نسبة العمولة');
    } catch (error) {
      return sendError(res, error.code || 'UPDATE_FAILED', error.message, error.statusCode || 500);
    }
  }
);

router.get(
  '/admin/withdrawals/:id/card',
  authenticate,
  authorize(ROLES.ADMIN),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return sendError(res, 'INVALID_ID', 'Invalid withdrawal id', 400);
      }
      const card = await walletService.revealWithdrawalCard(req.params.id);
      auditLog(req, 'ADMIN_REVEAL_WITHDRAWAL_CARD', { withdrawalId: req.params.id });
      return sendSuccess(res, card);
    } catch (error) {
      return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
    }
  }
);

router.patch(
  '/admin/withdrawals/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(reviewWithdrawalSchema),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return sendError(res, 'INVALID_ID', 'Invalid withdrawal id', 400);
      }
      const withdrawal = await walletService.reviewWithdrawal({
        withdrawalId: req.params.id,
        adminId: req.user.id,
        status: req.body.status,
        adminNote: req.body.adminNote,
      });
      auditLog(req, 'ADMIN_REVIEW_WITHDRAWAL', { withdrawalId: req.params.id, status: req.body.status });
      return sendSuccess(res, { withdrawal }, 'تم تحديث طلب السحب');
    } catch (error) {
      return sendError(res, error.code || 'UPDATE_FAILED', error.message, error.statusCode || 500);
    }
  }
);

export default router;
