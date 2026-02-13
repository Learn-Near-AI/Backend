import { buildContract } from '../../build-contract-optimized.js'
import { logger } from '../utils/logger.js'

export async function compileJsContract(code, language = 'JavaScript') {
  logger.info({ language }, 'Compiling JS/TS contract')
  try {
    const wasmBuffer = await buildContract(code, language)
    return {
      success: true,
      wasm: wasmBuffer.toString('base64'),
      size: wasmBuffer.length,
    }
  } catch (error) {
    logger.error({ err: error.message }, 'JS compilation failed')
    throw error
  }
}
