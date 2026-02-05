/**
 * Compilation service - wraps build-contract-optimized
 */
import { buildContract } from '../../build-contract-optimized.js';
import { CompilationError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export async function compileContract(code, language) {
  logger.info(`Compiling ${language} contract`);
  try {
    const wasmBuffer = await buildContract(code, language);
    return {
      success: true,
      wasm: wasmBuffer.toString('base64'),
      size: wasmBuffer.length,
    };
  } catch (error) {
    logger.error('Compilation failed', { error: error?.message });
    throw new CompilationError(
      error?.message || 'Compilation failed',
      error?.stderr || ''
    );
  }
}
