import * as orderService from '../services/order.service.js';
import { sendSuccess, sendError, sendPaginated } from '../utils/response.js';

/**
 * POST /api/orders
 */
export const createOrder = async (req, res) => {
  try {
    const order = await orderService.createOrder(req.user.id, req.body);
    return sendSuccess(res, { order }, 'تم شراء الخدمة بنجاح', 201);
  } catch (error) {
    return sendError(res, error.code || 'CREATE_FAILED', error.message, error.statusCode || 500);
  }
};

/**
 * GET /api/orders
 */
export const getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, scope } = req.query;
    const result = await orderService.getOrders(req.user.id, req.user.role, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      scope,
    });
    return sendPaginated(res, result.orders, result.pagination);
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
};

/**
 * GET /api/orders/:id
 */
export const getOrderById = async (req, res) => {
  try {
    const order = await orderService.getOrderById(req.params.id, req.user.id, req.user.role);
    return sendSuccess(res, { order });
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
};

/**
 * PATCH /api/orders/:id/status
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const order = await orderService.updateOrderStatus(
      req.params.id,
      req.body.status,
      req.user.id,
      req.user.role,
      req.body.note
    );
    return sendSuccess(res, { order }, 'Order status updated');
  } catch (error) {
    return sendError(res, error.code || 'UPDATE_FAILED', error.message, error.statusCode || 500);
  }
};

/**
 * POST /api/orders/:id/accept — provider accepts an incoming order
 */
export const acceptOrder = async (req, res) => {
  try {
    const order = await orderService.acceptOrder(req.params.id, req.user.id);
    return sendSuccess(res, { order }, 'Order accepted');
  } catch (error) {
    return sendError(res, error.code || 'ACCEPT_FAILED', error.message, error.statusCode || 500);
  }
};

/**
 * PATCH /api/orders/:id/assign
 */
export const assignProvider = async (req, res) => {
  try {
    const order = await orderService.assignProvider(req.params.id, req.body.providerId);
    return sendSuccess(res, { order }, 'Provider assigned');
  } catch (error) {
    return sendError(res, error.code || 'ASSIGN_FAILED', error.message, error.statusCode || 500);
  }
};
