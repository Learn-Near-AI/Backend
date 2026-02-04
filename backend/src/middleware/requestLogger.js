import { randomUUID } from 'crypto'
import { logger } from '../utils/logger.js'

/**
 * Attach request ID and request-scoped logger to each request.
 */
export function requestLogger(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID()
  req.logger = logger.child({
    requestId: req.id,
    method: req.method,
    path: req.path,
  })
  res.setHeader('X-Request-Id', req.id)
  next()
}
