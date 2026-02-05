import { body, validationResult } from 'express-validator';
import { ValidationError } from './errorHandler.js';

/**
 * Sends 400 with validation errors if any
 */
export function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    return next(new ValidationError('Validation failed', details));
  }
  next();
}

export const compileValidation = [
  body('code').notEmpty().withMessage('code is required').isString(),
  body('language')
    .notEmpty()
    .withMessage('language is required')
    .isIn(['JavaScript', 'TypeScript'])
    .withMessage('language must be JavaScript or TypeScript'),
  body('projectId').optional().isString(),
];

export const deployValidation = [
  body('wasmBase64').notEmpty().withMessage('wasmBase64 is required').isString(),
  body('contractAccountId').optional().isString(),
  body('initMethod').optional().isString(),
  body('initArgs').optional().isObject(),
];

export const contractCallValidation = [
  body('contractAccountId').notEmpty().withMessage('contractAccountId is required').isString(),
  body('methodName').notEmpty().withMessage('methodName is required').isString(),
  body('args').optional().isObject(),
  body('accountId').optional().isString(),
  body('deposit').optional().isString(),
  body('gas').optional().isString(),
];

export const contractViewValidation = [
  body('contractAccountId').notEmpty().withMessage('contractAccountId is required').isString(),
  body('methodName').notEmpty().withMessage('methodName is required').isString(),
  body('args').optional().isObject(),
];
