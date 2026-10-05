import { Router } from 'express';
import mongoose from 'mongoose';
import { sendError } from '../utils/response.js';
import { uploadFile, downloadFile, getOrderFiles } from '../controllers/file.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import upload from '../config/multer.js';

const router = Router();

// All file routes require authentication
router.use(authenticate);

// Reject malformed ObjectIds with 400 instead of a 500 CastError
router.param('order_id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return sendError(res, 'INVALID_ID', `Invalid order id: ${id}`, 400);
  }
  next();
});
router.param('file_id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return sendError(res, 'INVALID_ID', `Invalid file id: ${id}`, 400);
  }
  next();
});

// POST /api/files/upload/:order_id
router.post('/upload/:order_id', upload.single('file'), uploadFile);

// GET /api/files/:file_id/download
router.get('/:file_id/download', downloadFile);

// GET /api/files/order/:order_id
router.get('/order/:order_id', getOrderFiles);

export default router;
