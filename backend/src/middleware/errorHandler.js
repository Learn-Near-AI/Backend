/**
 * Central error handler - consistent error responses, no stack in production
 */
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class CompilationError extends AppError {
  constructor(message, stderr = '') {
    super(message, 500, 'COMPILATION_FAILED');
    this.stderr = stderr;
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message) {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  logger.error(err.message, {
    code,
    statusCode,
    path: req.path,
    err: config.isDevelopment ? err.stack : undefined,
  });

  const body = {
    error: err.message || 'Internal server error',
    code,
  };

  if (err.details) {
    body.details = err.details;
  }

  if (err.stderr && statusCode === 500) {
    body.stderr = err.stderr;
  }

  if (config.isDevelopment && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}
