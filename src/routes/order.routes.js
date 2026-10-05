import { Router } from 'express';
import mongoose from 'mongoose';
import { sendError } from '../utils/response.js';
import {
  createOrder,
  getOrders,
  getOrderById,
  acceptOrder,
  updateOrderStatus,
  assignProvider,
} from '../controllers/order.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  createOrderSchema,
  updateStatusSchema,
  assignProviderSchema,
} from '../validators/order.validator.js';
import { ROLES } from '../utils/constants.js';

const router = Router();

// All order routes require authentication
router.use(authenticate);

// Reject malformed ObjectIds with 400 instead of a 500 CastError
router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return sendError(res, 'INVALID_ID', `Invalid order id: ${id}`, 400);
  }
  next();
});

// POST /api/orders — student only
router.post('/', authorize(ROLES.STUDENT), validate(createOrderSchema), createOrder);

// GET /api/orders — all authenticated (filtered by role in service)
router.get('/', getOrders);

// GET /api/orders/:id — participant or admin
router.get('/:id', getOrderById);

// POST /api/orders/:id/accept — provider takes an incoming (pending, unassigned) order
router.post('/:id/accept', authorize(ROLES.PROVIDER), acceptOrder);

// PATCH /api/orders/:id/status — provider, student, or admin
router.patch(
  '/:id/status',
  authorize(ROLES.PROVIDER, ROLES.STUDENT, ROLES.ADMIN),
  validate(updateStatusSchema),
  updateOrderStatus
);

// PATCH /api/orders/:id/assign — admin only
router.patch(
  '/:id/assign',
  authorize(ROLES.ADMIN),
  validate(assignProviderSchema),
  assignProvider
);

export default router;
