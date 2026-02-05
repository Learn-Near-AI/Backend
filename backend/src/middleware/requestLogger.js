/**
 * Request logging middleware - logs method, path, status, duration
 */
import { logger } from '../utils/logger.js';

export function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode}`, {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
    });
  });

  req.requestId = requestId;
  next();
}
