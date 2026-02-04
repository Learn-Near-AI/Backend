import { buildRustContract, warmupSharedTarget } from './buildRustContract.js'
import { logger } from '../utils/logger.js'

/**
 * Compile Rust source code to NEAR WASM contract.
 * @param {string} sourceCode - Rust contract source
 * @param {string|null} projectId - Optional project ID (for API compatibility)
 * @returns {Promise<Object>} Compilation result
 */
export async function compileRustContract(sourceCode, projectId = null) {
  logger.info({ projectId }, 'Compiling Rust contract')
  const result = await buildRustContract(sourceCode, projectId)
  logger.info(
    {
      success: result.success,
      wasmSize: result.wasmSize,
      compilationTime: result.compilation_time,
    },
    'Rust compilation completed'
  )
  return result
}

/**
 * Pre-warm the shared Cargo target for faster first compile.
 */
export async function warmupRustTarget() {
  try {
    logger.info('Pre-warming Rust build target')
    await warmupSharedTarget()
    logger.info('Rust warmup complete')
  } catch (err) {
    logger.warn({ err: err.message }, 'Rust warmup failed (first compile may be slow)')
    throw err
  }
}
