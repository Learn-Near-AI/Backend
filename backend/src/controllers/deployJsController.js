import * as compileJsService from '../services/compileJsService.js'
import * as deployJsService from '../services/deployJsService.js'

export async function compileJs(req, res, next) {
  try {
    const { code, language } = req.body
    const result = await compileJsService.compileJsContract(code, language)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function deployJs(req, res, next) {
  try {
    const { wasmBase64, contractAccountId, initMethod, initArgs } = req.body
    const result = await deployJsService.deployJsWasm(wasmBase64, {
      contractAccountId,
      initMethod,
      initArgs,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function callJsContractMethod(req, res, next) {
  try {
    const { contractAccountId, methodName, args, accountId, deposit, gas } = req.body
    const result = await deployJsService.callJsContract(
      contractAccountId,
      methodName,
      args || {},
      { accountId, deposit, gas }
    )
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function viewJsContractMethod(req, res, next) {
  try {
    const { contractAccountId, methodName, args } = req.body
    const result = await deployJsService.viewJsContract(
      contractAccountId,
      methodName,
      args || {}
    )
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export function getJsNearStatus(req, res) {
  const result = deployJsService.getJsNearStatus()
  res.json(result)
}
