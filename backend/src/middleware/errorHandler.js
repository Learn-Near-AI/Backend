import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import { CompileError, DeployError } from '../errors/AppError.js'

/**
 * Central error handling middleware.
 * Converts errors to consistent JSON responses and logs appropriately.
 * Handles CompileError and DeployError with their API-specific response formats.
 */
export function errorHandler(err, req, res, next) {
  const reqLogger = req.logger || logger
  const requestId = req.id || req.headers['x-request-id'] || 'unknown'

  // CompileError: return compile-specific format for frontend compatibility
  if (err instanceof CompileError) {
    reqLogger.error({ err, requestId }, `[COMPILE_FAILED] ${err.message}`)
    return res.status(500).json({
      success: false,
      exit_code: err.exit_code,
      stdout: err.stdout,
      stderr: err.stderr,
      wasm: null,
      size: 0,
      abi: null,
      compilation_time: err.compilation_time,
      error: err.message,
      details: {
        status: 'failed',
        compilation_time: err.compilation_time,
        project_path: err.project_path,
        wasm_size: 0,
        optimized: false,
      },
    })
  }

  // DeployError: return deploy-specific format for frontend compatibility
  if (err instanceof DeployError) {
    reqLogger.error({ err, requestId }, `[DEPLOY_FAILED] ${err.message}`)
    return res.status(500).json({
      success: false,
      error: err.message,
      deploymentTime: err.deploymentTime,
      subaccountId: err.subaccountId,
    })
  }

  // Generic errors
  const statusCode = err.statusCode ?? err.status ?? 500
  const code = err.code ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR')
  const message = err.message || 'An unexpected error occurred'

  const isProd = config.nodeEnv === 'production'
  const safeDetails = isProd ? undefined : err.details

  const response = {
    success: false,
    error: { code, message, ...(safeDetails && { details: safeDetails }) },
    message,
    requestId,
  }

  if (statusCode >= 500) {
    reqLogger.error({ err, requestId }, `[${code}] ${message}`)
  } else {
    reqLogger.warn({ err: { message }, requestId }, `[${code}] ${message}`)
  }

  res.status(statusCode).json(response)
}
