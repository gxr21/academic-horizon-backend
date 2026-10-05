import * as userService from '../services/user.service.js';
import { sendSuccess, sendError, sendPaginated } from '../utils/response.js';

/**
 * GET /api/user/profile
 */
export const getProfile = async (req, res) => {
  try {
    const user = await userService.getProfile(req.user.id);
    return sendSuccess(res, { user });
  } catch (error) {
    return sendError(
      res,
      error.code || 'FETCH_FAILED',
      error.message,
      error.statusCode || 500
    );
  }
};

/**
 * PATCH /api/user/profile
 */
export const updateProfile = async (req, res) => {
  try {
    const user = await userService.updateProfile(req.user.id, req.body);
    return sendSuccess(res, { user }, 'Profile updated successfully');
  } catch (error) {
    return sendError(
      res,
      error.code || 'UPDATE_FAILED',
      error.message,
      error.statusCode || 500
    );
  }
};

/**
 * POST /api/user/upgrade
 */
export const upgradeSubscription = async (req, res) => {
  try {
    const { subscriptionType } = req.body;
    const user = await userService.upgradeSubscription(req.user.id, subscriptionType);
    return sendSuccess(res, { user }, 'Subscription upgraded successfully');
  } catch (error) {
    return sendError(
      res,
      error.code || 'UPGRADE_FAILED',
      error.message,
      error.statusCode || 500
    );
  }
};

/**
 * POST /api/user/public-key
 */
export const updatePublicKey = async (req, res) => {
  try {
    const { publicKey } = req.body;
    const user = await userService.updatePublicKey(req.user.id, publicKey);
    return sendSuccess(res, { user }, 'Public key updated');
  } catch (error) {
    return sendError(
      res,
      error.code || 'UPDATE_FAILED',
      error.message,
      error.statusCode || 500
    );
  }
};

/**
 * GET /api/user/:id/public
 */
export const getPublicProfile = async (req, res) => {
  try {
    const profile = await userService.getPublicProfile(req.params.id);
    return sendSuccess(res, { profile });
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
};

/**
 * GET /api/user/:id/public-key
 */
export const getPublicKey = async (req, res) => {
  try {
    const data = await userService.getPublicKey(req.params.id);
    return sendSuccess(res, data);
  } catch (error) {
    return sendError(
      res,
      error.code || 'FETCH_FAILED',
      error.message,
      error.statusCode || 500
    );
  }
};

/**
 * GET /api/user
 * Admin only — list all users with pagination and optional role filter.
 */
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, role } = req.query;
    const result = await userService.getAllUsers({
      page: parseInt(page),
      limit: parseInt(limit),
      role: role || undefined,
    });
    return sendPaginated(res, result.users, result.pagination);
  } catch (error) {
    return sendError(res, error.code || 'FETCH_FAILED', error.message, error.statusCode || 500);
  }
};

/**
 * DELETE /api/user/:id
 * Admin only — delete a user by ID.
 */
export const deleteUser = async (req, res) => {
  try {
    await userService.deleteUser(req.params.id);
    return sendSuccess(res, null, 'User deleted successfully');
  } catch (error) {
    return sendError(res, error.code || 'DELETE_FAILED', error.message, error.statusCode || 500);
  }
};
