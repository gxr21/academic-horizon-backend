import path from 'path';
import fs from 'fs';
import File from '../models/File.js';
import Order from '../models/Order.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { ROLES, ORDER_STATUS } from '../utils/constants.js';
import { getIO } from '../sockets/io.js';
import { notifyUsers } from '../services/notification.service.js';

/**
 * Check if user is a participant in the order.
 */
const isParticipant = (order, userId) => {
  const isStudent = order.student_id.toString() === userId;
  const isProvider = order.provider_id && order.provider_id.toString() === userId;
  return isStudent || isProvider;
};

/**
 * Multer (busboy) decodes multipart filenames as latin1, which garbles
 * non-ASCII names (e.g. Arabic). Re-decode them as UTF-8.
 */
const decodeFilename = (name) => {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? name : decoded;
  } catch {
    return name;
  }
};

/** Remove a just-uploaded temp file when the request is rejected. */
const discardUpload = (req) => {
  if (req.file?.path) {
    fs.promises.unlink(req.file.path).catch(() => {});
  }
};

/**
 * POST /api/files/upload/:order_id
 * Participants (and admins) can attach any allowed file to the order's conversation.
 * The other participants are notified and the file appears live in the chat room.
 */
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 'NO_FILE', 'No file uploaded', 400);
    }

    const order = await Order.findById(req.params.order_id);
    if (!order) {
      discardUpload(req);
      return sendError(res, 'NOT_FOUND', 'Order not found', 404);
    }

    // Access control
    if (req.user.role !== ROLES.ADMIN && !isParticipant(order, req.user.id)) {
      discardUpload(req);
      return sendError(res, 'FORBIDDEN', 'You are not a participant in this order', 403);
    }

    if (order.status === ORDER_STATUS.CANCELLED) {
      discardUpload(req);
      return sendError(res, 'ORDER_CLOSED', 'Cannot upload files to a cancelled order', 400);
    }

    const originalName = decodeFilename(req.file.originalname);

    const file = await File.create({
      order_id: req.params.order_id,
      uploader_id: req.user.id,
      original_name: originalName,
      mime_type: req.file.mimetype,
      file_path: req.file.path,
      size: req.file.size,
    });

    const fileJson = file.toJSON();
    fileJson.uploader = { id: req.user.id, name: req.user.name };

    // Show the file live to everyone in the conversation
    const io = getIO();
    if (io) {
      io.to(`order:${order._id.toString()}`).emit('file_uploaded', fileJson);
    }

    // Notify the other participant(s)
    const recipients = [order.student_id, order.provider_id].filter(
      (id) => id && id.toString() !== req.user.id
    );
    await notifyUsers(recipients, {
      type: 'file_uploaded',
      title: 'ملف جديد',
      message: `أرسل ${req.user.name} ملفاً في الطلب "${order.title}": ${originalName}`,
      orderId: order._id,
    });

    return sendSuccess(res, { file: fileJson }, 'File uploaded successfully', 201);
  } catch (error) {
    discardUpload(req);
    return sendError(res, 'UPLOAD_FAILED', error.message, 500);
  }
};

/**
 * GET /api/files/:file_id/download
 */
export const downloadFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.file_id);
    if (!file) {
      return sendError(res, 'NOT_FOUND', 'File not found', 404);
    }

    const order = await Order.findById(file.order_id);
    if (!order) {
      return sendError(res, 'NOT_FOUND', 'Order not found', 404);
    }

    // Access control
    if (req.user.role !== ROLES.ADMIN && !isParticipant(order, req.user.id)) {
      return sendError(res, 'FORBIDDEN', 'You are not a participant in this order', 403);
    }

    const filePath = path.resolve(file.file_path);
    if (!fs.existsSync(filePath)) {
      return sendError(res, 'NOT_FOUND', 'File not found on server', 404);
    }

    // RFC 5987 encoding so non-ASCII (e.g. Arabic) names don't break the header
    const asciiFallback = file.original_name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`
    );
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(filePath);
  } catch (error) {
    return sendError(res, 'DOWNLOAD_FAILED', error.message, 500);
  }
};

/**
 * GET /api/files/order/:order_id
 */
export const getOrderFiles = async (req, res) => {
  try {
    const order = await Order.findById(req.params.order_id);
    if (!order) {
      return sendError(res, 'NOT_FOUND', 'Order not found', 404);
    }

    if (req.user.role !== ROLES.ADMIN && !isParticipant(order, req.user.id)) {
      return sendError(res, 'FORBIDDEN', 'You are not a participant in this order', 403);
    }

    const files = await File.find({ order_id: req.params.order_id })
      .populate('uploader_id', 'name')
      .sort({ created_at: 1 });

    return sendSuccess(res, {
      files: files.map((f) => {
        const json = f.toJSON();
        if (f.uploader_id && typeof f.uploader_id === 'object') {
          json.uploader = f.uploader_id.toJSON ? f.uploader_id.toJSON() : f.uploader_id;
          json.uploaderId = f.uploader_id._id.toString();
        }
        return json;
      }),
    });
  } catch (error) {
    return sendError(res, 'FETCH_FAILED', error.message, 500);
  }
};
