import { Router } from 'express';
import mongoose from 'mongoose';
import { sendError } from '../utils/response.js';
import { getMessages, sendMessage, getAdminKeys } from '../controllers/chat.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { sendMessageSchema } from '../validators/chat.validator.js';

const router = Router();

// All chat routes require authentication
router.use(authenticate);

// Reject malformed ObjectIds with 400 instead of a 500 CastError
router.param('order_id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return sendError(res, 'INVALID_ID', `Invalid order id: ${id}`, 400);
  }
  next();
});

// GET /api/chat/admin-keys — admin public keys used for safety-review key wrapping
router.get('/admin-keys', getAdminKeys);

// GET /api/chat/rooms/:order_id?page=1&limit=20
router.get('/rooms/:order_id', getMessages);

// POST /api/chat/rooms/:order_id/messages
router.post('/rooms/:order_id/messages', validate(sendMessageSchema), sendMessage);

export default router;
