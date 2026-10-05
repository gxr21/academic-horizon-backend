import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Service from '../models/Service.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { ROLES } from '../utils/constants.js';
import { notifyRole } from '../services/notification.service.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();

const createServiceSchema = z.object({
  title: z.string({ required_error: 'Title is required' }).trim().min(2, 'Title is too short').max(100),
  description: z.string().trim().max(1000).optional().default(''),
  price: z.coerce.number().min(0, 'Price cannot be negative').optional().default(0),
  serviceType: z.string().trim().min(1).max(50).optional().default('general'),
});

const updateServiceSchema = z.object({
  title: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(1000).optional(),
  price: z.coerce.number().min(0).optional(),
  serviceType: z.string().trim().min(1).max(50).optional(),
  isActive: z.boolean().optional(),
});

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return sendError(res, 'INVALID_ID', `Invalid service id: ${id}`, 400);
  }
  next();
});

/**
 * GET /api/services — public list of active services (newest first)
 */
router.get('/', async (req, res) => {
  try {
    const services = await Service.find({ is_active: true }).sort({ created_at: -1 });
    return sendSuccess(res, { services: services.map((s) => s.toJSON()) });
  } catch (error) {
    return sendError(res, 'FETCH_FAILED', error.message, 500);
  }
});

/**
 * GET /api/services/all — admin: every service including inactive ones
 */
router.get('/all', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const services = await Service.find({}).sort({ created_at: -1 });
    return sendSuccess(res, { services: services.map((s) => s.toJSON()) });
  } catch (error) {
    return sendError(res, 'FETCH_FAILED', error.message, 500);
  }
});

/**
 * POST /api/services — admin: add a new service.
 * Providers and students are notified.
 */
router.post('/', authenticate, authorize(ROLES.ADMIN), validate(createServiceSchema), async (req, res) => {
  try {
    const { title, description, price, serviceType } = req.body;
    const service = await Service.create({
      title,
      description,
      price,
      service_type: serviceType,
      created_by: req.user.id,
    });

    const payload = {
      type: 'new_service',
      title: 'خدمة جديدة',
      message: `تمت إضافة خدمة جديدة: ${title}`,
      serviceId: service._id,
    };
    await Promise.all([notifyRole(ROLES.PROVIDER, payload), notifyRole(ROLES.STUDENT, payload)]);

    return sendSuccess(res, { service: service.toJSON() }, 'Service created', 201);
  } catch (error) {
    return sendError(res, 'CREATE_FAILED', error.message, 500);
  }
});

/**
 * PATCH /api/services/:id — admin: edit / activate / deactivate
 */
router.patch('/:id', authenticate, authorize(ROLES.ADMIN), validate(updateServiceSchema), async (req, res) => {
  try {
    const { title, description, price, serviceType, isActive } = req.body;
    const update = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (price !== undefined) update.price = price;
    if (serviceType !== undefined) update.service_type = serviceType;
    if (isActive !== undefined) update.is_active = isActive;

    const service = await Service.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!service) return sendError(res, 'NOT_FOUND', 'Service not found', 404);
    return sendSuccess(res, { service: service.toJSON() }, 'Service updated');
  } catch (error) {
    return sendError(res, 'UPDATE_FAILED', error.message, 500);
  }
});

/**
 * DELETE /api/services/:id — admin
 */
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return sendError(res, 'NOT_FOUND', 'Service not found', 404);
    return sendSuccess(res, { id: req.params.id }, 'Service deleted');
  } catch (error) {
    return sendError(res, 'DELETE_FAILED', error.message, 500);
  }
});

export default router;
