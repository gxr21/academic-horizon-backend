import * as authService from '../services/auth.service.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * POST /api/auth/register
 */
export const register = async (req, res) => {
  try {
    const result = await authService.register(req.body);
    return sendSuccess(res, result, 'Registration successful', 201);
  } catch (error) {
    return sendError(
      res,
      error.code || 'REGISTRATION_FAILED',
      error.message,
      error.statusCode || 500
    );
  }
};

/**
 * POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    const result = await authService.login(req.body);
    return sendSuccess(res, result, 'Login successful');
  } catch (error) {
    return sendError(
      res,
      error.code || 'LOGIN_FAILED',
      error.message,
      error.statusCode || 500
    );
  }
};

/**
 * GET /api/auth/me
 */
export const getMe = async (req, res) => {
  try {
    const user = await authService.getMe(req.user.id);
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

export const forgotPassword = async (req, res) => {
  try {
    await authService.forgotPassword(req.body.email);
    return sendSuccess(
      res,
      {},
      'إذا كان البريد مسجلاً ستصلك رسالة فيها رابط إعادة تعيين كلمة المرور خلال دقائق.'
    );
  } catch (error) {
    return sendError(
      res,
      error.code || 'RESET_FAILED',
      error.message,
      error.statusCode || 500
    );
  }
};

export const verifyResetToken = async (req, res) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const result = await authService.verifyResetToken(token);
    return sendSuccess(res, result);
  } catch (error) {
    return sendError(
      res,
      error.code || 'RESET_LINK_INVALID',
      error.message,
      error.statusCode || 400
    );
  }
};

export const resetPassword = async (req, res) => {
  try {
    await authService.resetPassword(req.body);
    return sendSuccess(res, {}, 'تم تعيين كلمة المرور. يمكنك تسجيل الدخول الآن.');
  } catch (error) {
    return sendError(
      res,
      error.code || 'RESET_FAILED',
      error.message,
      error.statusCode || 500
    );
  }
};
