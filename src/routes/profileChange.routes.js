import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/role.middleware.js';
import { ROLES } from '../utils/constants.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { uploadDocuments } from '../config/multer.js';
import * as profileChangeService from '../services/profileChange.service.js';

const router = Router();
router.use(authenticate);

const decodeFilename = (name) => {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? name : decoded;
  } catch {
    return name;
  }
};

/**
 * POST /api/profile-changes
 * Provider submits a personal-data change request with identity documents.
 */
router.post(
  '/',
  authorize(ROLES.PROVIDER),
  uploadDocuments.array('documents', 5),
  async (req, res) => {
    try {
      const files = (req.files || []).map((f) => ({
        ...f,
        originalname: decodeFilename(f.originalname),
      }));
      const request = await profileChangeService.createChangeRequest({
        providerId: req.user.id,
        fields: {
          name: req.body.name,
          phone: req.body.phone,
          email: req.body.email,
          bio: req.body.bio,
        },
        files,
        note: req.body.note,
      });
      return sendSuccess(res, { request: request.toJSON() }, 'تم إرسال طلب التغيير إلى الإدارة', 201);
    } catch (error) {
      return sendError(res, error.code || 'REQUEST_FAILED', error.message, error.statusCode || 500);
    }
  }
);

/**
 * GET /api/profile-changes/mine
 */
router.get('/mine', authorize(ROLES.PROVIDER), async (req, res) => {
  try {
    const requests = await profileChangeService.listMine(req.user.id);
    return sendSuccess(res, { requests });
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
});

/**
 * GET /api/profile-changes/:id/documents/:index
 */
router.get('/:id/documents/:index', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 'INVALID_ID', 'Invalid request id', 400);
    }
    const doc = await profileChangeService.getDocument({
      requestId: req.params.id,
      index: req.params.index,
      user: req.user,
    });
    const filePath = path.resolve(doc.file_path);
    if (!fs.existsSync(filePath)) {
      return sendError(res, 'NOT_FOUND', 'File not found on server', 404);
    }
    const asciiFallback = doc.original_name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`
    );
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(filePath);
  } catch (error) {
    return sendError(res, error.code || 'DOWNLOAD_FAILED', error.message, error.statusCode || 500);
  }
});

export default router;
