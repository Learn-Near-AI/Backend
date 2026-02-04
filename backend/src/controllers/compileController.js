import { compileRustContract } from '../services/compileService.js'

/**
 * POST /api/compile - Compile Rust contract to WASM
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function compileContract(req, res, next) {
  try {
    const { code, language, projectId } = req.validated
    const result = await compileRustContract(code, projectId)

    res.json({
      success: true,
      exit_code: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
      wasm: result.wasm,
      size: result.wasmSize,
      abi: result.abi,
      compilation_time: result.compilation_time,
      details: {
        status: 'success',
        compilation_time: result.compilation_time,
        project_path: result.project_path,
        wasm_size: result.wasmSize,
        optimized: true,
      },
    })
  } catch (err) {
    next(err)
  }
}
