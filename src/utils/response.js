/**
 * Standardized API response helpers.
 * All APIs return { success, data, message } or { success, error: { code, message } }
 */

export const sendSuccess = (res, data = {}, message = '', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
};

export const sendError = (res, code, message, statusCode = 400) => {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
};

export const sendPaginated = (res, data, pagination, message = '') => {
  return res.status(200).json({
    success: true,
    data,
    pagination,
    message,
  });
};
