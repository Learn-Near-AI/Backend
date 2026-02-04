import { ValidationError } from '../errors/AppError.js'
import { config } from '../config/index.js'

/**
 * Validation schemas and middleware for request bodies.
 */

const MAX_CODE_LENGTH = config.maxCodeLength
const MAX_WASM_BASE64_LENGTH = config.maxWasmBase64Length
const MAX_ACCOUNT_ID_LENGTH = 64
const MAX_METHOD_NAME_LENGTH = 64

function validateCompileBody(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object')
  }
  const { code, language, projectId } = body

  if (!code || typeof code !== 'string') {
    throw new ValidationError('Missing or invalid "code" field (must be a non-empty string)')
  }
  if (code.length > MAX_CODE_LENGTH) {
    throw new ValidationError(`Code exceeds maximum length of ${MAX_CODE_LENGTH} characters`)
  }
  if (language !== 'Rust') {
    throw new ValidationError('Only Rust contracts are supported. Use language: "Rust".')
  }
  if (projectId !== undefined && (typeof projectId !== 'string' || projectId.length > 128)) {
    throw new ValidationError('Invalid "projectId" (optional, max 128 chars)')
  }

  return { code, language, projectId }
}

function validateDeployBody(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object')
  }
  const { wasmBase64, contractAccountId, initMethod, initArgs, useSubaccount, userId, projectId } = body

  if (!wasmBase64 || typeof wasmBase64 !== 'string') {
    throw new ValidationError('Missing or invalid "wasmBase64" field (must be a non-empty base64 string)')
  }
  if (wasmBase64.length > MAX_WASM_BASE64_LENGTH) {
    throw new ValidationError(`WASM payload exceeds maximum size`)
  }
  if (contractAccountId !== undefined && (typeof contractAccountId !== 'string' || contractAccountId.length > MAX_ACCOUNT_ID_LENGTH)) {
    throw new ValidationError('Invalid "contractAccountId"')
  }
  if (initMethod !== undefined && (typeof initMethod !== 'string' || initMethod.length > MAX_METHOD_NAME_LENGTH)) {
    throw new ValidationError('Invalid "initMethod"')
  }
  if (initArgs !== undefined && (typeof initArgs !== 'object' || initArgs === null)) {
    throw new ValidationError('"initArgs" must be an object')
  }
  if (useSubaccount && (typeof userId !== 'undefined' && (typeof userId !== 'string' || userId.length > 128))) {
    throw new ValidationError('Invalid "userId"')
  }
  if (useSubaccount && (typeof projectId !== 'undefined' && (typeof projectId !== 'string' || projectId.length > 128))) {
    throw new ValidationError('Invalid "projectId"')
  }

  return {
    wasmBase64,
    contractAccountId,
    initMethod: initMethod || 'new',
    initArgs: initArgs || {},
    useSubaccount: !!useSubaccount,
    userId: userId || 'user',
    projectId: projectId || 'project',
  }
}

function validateContractCallBody(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object')
  }
  const { contractAccountId, methodName, args, accountId, deposit, gas } = body

  if (!contractAccountId || typeof contractAccountId !== 'string') {
    throw new ValidationError('Missing or invalid "contractAccountId"')
  }
  if (contractAccountId.length > MAX_ACCOUNT_ID_LENGTH) {
    throw new ValidationError('Invalid "contractAccountId"')
  }
  if (!methodName || typeof methodName !== 'string') {
    throw new ValidationError('Missing or invalid "methodName"')
  }
  if (methodName.length > MAX_METHOD_NAME_LENGTH) {
    throw new ValidationError('Invalid "methodName"')
  }
  if (args !== undefined && (typeof args !== 'object' || args === null)) {
    throw new ValidationError('"args" must be an object')
  }
  if (accountId !== undefined && (typeof accountId !== 'string' || accountId.length > MAX_ACCOUNT_ID_LENGTH)) {
    throw new ValidationError('Invalid "accountId"')
  }

  return {
    contractAccountId,
    methodName,
    args: args || {},
    accountId,
    deposit,
    gas,
  }
}

function validateContractViewBody(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object')
  }
  const { contractAccountId, methodName, args } = body

  if (!contractAccountId || typeof contractAccountId !== 'string') {
    throw new ValidationError('Missing or invalid "contractAccountId"')
  }
  if (contractAccountId.length > MAX_ACCOUNT_ID_LENGTH) {
    throw new ValidationError('Invalid "contractAccountId"')
  }
  if (!methodName || typeof methodName !== 'string') {
    throw new ValidationError('Missing or invalid "methodName"')
  }
  if (methodName.length > MAX_METHOD_NAME_LENGTH) {
    throw new ValidationError('Invalid "methodName"')
  }
  if (args !== undefined && (typeof args !== 'object' || args === null)) {
    throw new ValidationError('"args" must be an object')
  }

  return {
    contractAccountId,
    methodName,
    args: args || {},
  }
}

export function validateCompile(req, res, next) {
  try {
    req.validated = validateCompileBody(req.body)
    next()
  } catch (err) {
    next(err)
  }
}

export function validateDeploy(req, res, next) {
  try {
    req.validated = validateDeployBody(req.body)
    next()
  } catch (err) {
    next(err)
  }
}

export function validateContractCall(req, res, next) {
  try {
    req.validated = validateContractCallBody(req.body)
    next()
  } catch (err) {
    next(err)
  }
}

export function validateContractView(req, res, next) {
  try {
    req.validated = validateContractViewBody(req.body)
    next()
  } catch (err) {
    next(err)
  }
}
