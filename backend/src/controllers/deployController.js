import {
  deployContract,
  deployToSubaccount,
  callContract,
  viewContract,
} from '../services/deployService.js'

/**
 * POST /api/deploy - Deploy WASM contract to NEAR
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function deploy(req, res, next) {
  try {
    const { wasmBase64, contractAccountId, initMethod, initArgs, useSubaccount, userId, projectId } =
      req.validated

    const wasmBuffer = Buffer.from(wasmBase64, 'base64')

    if (useSubaccount) {
      const result = await deployToSubaccount(wasmBuffer, {
        userId,
        projectId,
        initMethod,
        initArgs,
      })
      return res.json(result)
    }

    const result = await deployContract(wasmBuffer, {
      contractAccountId,
      initMethod,
      initArgs,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/contract/call - Call contract change method
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function callContractMethod(req, res, next) {
  try {
    const { contractAccountId, methodName, args, accountId, deposit, gas } = req.validated

    const result = await callContract(contractAccountId, methodName, args, {
      accountId,
      deposit,
      gas,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/contract/view - Call contract view method (read-only)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function viewContractMethod(req, res, next) {
  try {
    const { contractAccountId, methodName, args } = req.validated

    const result = await viewContract(contractAccountId, methodName, args)
    res.json(result)
  } catch (err) {
    next(err)
  }
}
