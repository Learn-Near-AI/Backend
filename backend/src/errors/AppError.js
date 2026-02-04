/**
 * Base application error with HTTP status and error code.
 * @extends Error
 */
export class AppError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'AppError'
    this.statusCode = options.statusCode ?? 500
    this.code = options.code ?? 'INTERNAL_ERROR'
    this.details = options.details ?? null
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR', details })
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND' })
    this.name = 'NotFoundError'
  }
}

/**
 * Compile failure with build output for API response.
 * @extends AppError
 */
export class CompileError extends AppError {
  constructor(message, options = {}) {
    super(message, { statusCode: 500, code: 'COMPILE_FAILED', ...options })
    this.name = 'CompileError'
    this.exit_code = options.exit_code ?? -1
    this.stdout = options.stdout ?? ''
    this.stderr = options.stderr ?? ''
    this.compilation_time = options.compilation_time ?? 0
    this.project_path = options.project_path ?? ''
  }
}

/**
 * Deploy failure with deployment context for API response.
 * @extends AppError
 */
export class DeployError extends AppError {
  constructor(message, options = {}) {
    super(message, { statusCode: 500, code: 'DEPLOY_FAILED', ...options })
    this.name = 'DeployError'
    this.deploymentTime = options.deploymentTime ?? 0
    this.subaccountId = options.subaccountId ?? null
  }
}
