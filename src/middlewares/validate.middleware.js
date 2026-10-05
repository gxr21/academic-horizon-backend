import { sendError } from '../utils/response.js';

/**
 * Generic Zod validation middleware.
 * Validates req.body, req.query, or req.params against a Zod schema.
 *
 * Usage:
 *   validate(schema)           → validates req.body
 *   validate(schema, 'query')  → validates req.query
 *   validate(schema, 'params') → validates req.params
 */
export const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));

      return sendError(
        res,
        'VALIDATION_ERROR',
        errors.map((e) => `${e.field}: ${e.message}`).join(', '),
        400
      );
    }

    // Replace source data with parsed/transformed values
    req[source] = result.data;
    next();
  };
};
