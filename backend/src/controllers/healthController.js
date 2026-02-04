import { config } from '../config/index.js'
import { areCredentialsConfigured } from '../services/deployService.js'

/**
 * GET /api/health - Basic health check
 */
export function getHealth(req, res, next) {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
}

/**
 * GET /api/near/status - NEAR configuration status
 */
export function getNearStatus(req, res, next) {
  const configured = areCredentialsConfigured()
  res.json({
    success: true,
    configured,
    accountId: config.nearAccountId || null,
    network: config.nearNetwork,
    message: configured ? 'NEAR is configured and ready' : 'NEAR credentials not configured',
  })
}
