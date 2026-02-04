import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { connect, KeyPair, keyStores, utils } from 'near-api-js'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import { AppError, DeployError } from '../errors/AppError.js'

const { parseNearAmount } = utils.format

/** NEAR account creation finalization delay (ms). Blockchains need time to process. */
const SUBACCOUNT_FINALIZATION_MS = 2000
/** NEAR to transfer when creating subaccount (covers storage + deploy + proof). */
const SUBACCOUNT_INITIAL_NEAR = '6.0'
/** NEAR sent back to parent as proof-of-deployment. */
const PROOF_TRANSFER_NEAR = '0.03'

/**
 * Write credentials to ~/.near-credentials for NEAR CLI compatibility.
 * near-api-js uses InMemoryKeyStore, but some tooling expects files on disk.
 * @param {string} accountId
 * @param {string} privateKey
 * @param {string} network
 */
async function setupNearCredentials() {
  const accountId = config.nearAccountId
  const privateKey = config.nearPrivateKey
  const network = config.nearNetwork

  if (!accountId || !privateKey) {
    throw new Error('NEAR credentials not configured. Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY.')
  }

  const credentialsDir = join(homedir(), '.near-credentials', network)
  await mkdir(credentialsDir, { recursive: true })

  const credentialsFile = join(credentialsDir, `${accountId}.json`)
  const credentials = {
    account_id: accountId,
    private_key: privateKey,
  }

  await writeFile(credentialsFile, JSON.stringify(credentials, null, 2), 'utf-8')
  logger.debug({ accountId, network }, 'NEAR credentials configured')

  return { accountId, network }
}

async function setupNearConnection() {
  const { accountId, network } = await setupNearCredentials()
  const privateKey = config.nearPrivateKey

  const keyStore = new keyStores.InMemoryKeyStore()
  const keyPair = KeyPair.fromString(privateKey)
  await keyStore.setKey(network, accountId, keyPair)

  const near = await connect({
    networkId: network,
    keyStore,
    nodeUrl: config.nearNodeUrl,
  })

  return { near, accountId, network }
}

function generateSubaccountName(userId, projectId, parentAccount) {
  const userPrefix = (userId || 'user').substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, '')
  const projectPrefix = (projectId || 'proj').substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, '')
  const timestamp = Date.now()
  return `${userPrefix}-${projectPrefix}-${timestamp}.${parentAccount}`
}

export async function deployContract(wasmBuffer, options = {}) {
  const startTime = Date.now()

  try {
    const { near, accountId, network } = await setupNearConnection()
    const contractAccountId = options.contractAccountId || accountId

    logger.info({ contractAccountId, network, wasmSize: wasmBuffer.length }, 'Deploying contract')

    const account = await near.account(accountId)
    const deployResult = await account.deployContract(wasmBuffer)
    const transactionHash = deployResult.transaction.hash

    logger.info({ transactionHash }, 'Contract deployed')

    let initialized = false
    let initError = null
    if (options.initMethod) {
      const initMethodName = options.initMethod
      const initArgs = options.initArgs || {}

      try {
        await account.functionCall({
          contractId: contractAccountId,
          methodName: initMethodName,
          args: initArgs,
        })
        initialized = true
        logger.info('Contract initialized')
      } catch (error) {
        logger.warn({ error: error.message }, 'Initialization failed (may be normal if already initialized)')
        initError = error.message
      }
    }

    const deploymentTime = (Date.now() - startTime) / 1000

    return {
      success: true,
      contractId: contractAccountId,
      contractAccountId,
      accountId: contractAccountId,
      transactionHash,
      network,
      wasmSize: wasmBuffer.length,
      deploymentTime,
      explorerUrl: transactionHash ? `${config.nearExplorerBaseUrl}/transactions/${transactionHash}` : null,
      accountUrl: `${config.nearExplorerBaseUrl}/accounts/${contractAccountId}`,
      initialized,
      initError,
    }
  } catch (error) {
    logger.error({ err: error }, 'Deployment error')
    throw new DeployError(error.message, {
      deploymentTime: (Date.now() - startTime) / 1000,
    })
  }
}

export async function deployToSubaccount(wasmBuffer, options = {}) {
  const startTime = Date.now()
  let subaccountKeyPair = null
  let subaccountId = null

  try {
    const { accountId: parentAccountId, network } = await setupNearCredentials()
    subaccountId = generateSubaccountName(options.userId, options.projectId, parentAccountId)

    logger.info({ subaccountId }, 'Creating subaccount')

    const keyStore = new keyStores.InMemoryKeyStore()
    const parentKeyPair = KeyPair.fromString(config.nearPrivateKey)
    await keyStore.setKey(network, parentAccountId, parentKeyPair)

    subaccountKeyPair = KeyPair.fromRandom('ed25519')
    const subaccountPublicKey = subaccountKeyPair.getPublicKey()

    const near = await connect({
      networkId: network,
      keyStore,
      nodeUrl: config.nearNodeUrl,
    })

    const parentAccount = await near.account(parentAccountId)

    const createAccountResult = await parentAccount.createAccount(
      subaccountId,
      subaccountPublicKey,
      parseNearAmount(SUBACCOUNT_INITIAL_NEAR)
    )
    const createTxHash = createAccountResult.transaction.hash

    logger.info({ createTxHash }, 'Subaccount created')

    await new Promise((resolve) => setTimeout(resolve, SUBACCOUNT_FINALIZATION_MS))

    const credentialsDir = join(homedir(), '.near-credentials', network)
    await mkdir(credentialsDir, { recursive: true })
    const subaccountCredentialsFile = join(credentialsDir, `${subaccountId}.json`)
    await writeFile(
      subaccountCredentialsFile,
      JSON.stringify(
        {
          account_id: subaccountId,
          private_key: subaccountKeyPair.toString(),
        },
        null,
        2
      ),
      'utf-8'
    )

    const subaccountAccount = await near.account(subaccountId)
    await keyStore.setKey(network, subaccountId, subaccountKeyPair)

    const deployResult = await subaccountAccount.deployContract(wasmBuffer)
    const deployTxHash = deployResult.transaction.hash

    logger.info({ deployTxHash }, 'Contract deployed to subaccount')

    let initResult = null
    let initialized = false
    if (options.initMethod) {
      const initMethodName = options.initMethod
      const initArgs = options.initArgs || {}

      try {
        await subaccountAccount.functionCall({
          contractId: subaccountId,
          methodName: initMethodName,
          args: initArgs,
        })
        initialized = true
      } catch (error) {
        logger.warn({ error: error.message }, 'Initialization failed')
        initResult = { error: error.message }
      }
    }

    const proofTransferResult = await subaccountAccount.sendMoney(
      parentAccountId,
      parseNearAmount(PROOF_TRANSFER_NEAR)
    )
    const proofTxHash = proofTransferResult.transaction.hash

    let gasUsed = null
    try {
      const txStatus = await near.connection.provider.txStatus(deployTxHash, subaccountId)
      if (txStatus.receipts_outcome) {
        gasUsed = txStatus.receipts_outcome
          .reduce((sum, receipt) => sum + (receipt.outcome.gas_burnt || 0), 0)
          .toString()
      }
    } catch (e) {
      logger.warn({ error: e.message }, 'Could not fetch gas info')
    }

    const deploymentTime = (Date.now() - startTime) / 1000

    return {
      success: true,
      contractId: subaccountId,
      contractAccountId: subaccountId, // alias for backward compatibility
      accountId: subaccountId,
      transactionHash: deployTxHash, // alias for backward compatibility
      parentAccountId,
      network,
      wasmSize: wasmBuffer.length,
      deploymentTime,
      transactions: {
        createAccount: {
          hash: createTxHash,
          url: `${config.nearExplorerBaseUrl}/transactions/${createTxHash}`,
        },
        deploy: {
          hash: deployTxHash,
          url: deployTxHash ? `${config.nearExplorerBaseUrl}/transactions/${deployTxHash}` : null,
        },
        proofTransfer: {
          hash: proofTxHash,
          url: `${config.nearExplorerBaseUrl}/transactions/${proofTxHash}`,
        },
      },
      explorerUrl: deployTxHash ? `${config.nearExplorerBaseUrl}/transactions/${deployTxHash}` : null,
      accountUrl: `${config.nearExplorerBaseUrl}/accounts/${subaccountId}`,
      gasUsed,
      initialized,
      initError: initResult?.error || null,
    }
  } catch (error) {
    logger.error({ err: error, subaccountId }, 'Subaccount deployment error')
    throw new DeployError(error.message, {
      deploymentTime: (Date.now() - startTime) / 1000,
      subaccountId: subaccountId || null,
    })
  }
}

export async function callContract(contractAccountId, methodName, args = {}, options = {}) {
  try {
    const { near, accountId, network } = await setupNearConnection()
    const callerAccountId = options.accountId || accountId

    logger.info({ contractAccountId, methodName }, 'Calling contract')

    const account = await near.account(callerAccountId)
    const callOptions = {
      contractId: contractAccountId,
      methodName,
      args,
    }
    if (options.deposit) {
      callOptions.attachedDeposit = parseNearAmount(options.deposit)
    }
    if (options.gas) {
      callOptions.gas = options.gas
    }

    const result = await account.functionCall(callOptions)

    return {
      success: true,
      result,
      transactionHash: result.transaction.hash,
      explorerUrl: `${config.nearExplorerBaseUrl}/transactions/${result.transaction.hash}`,
    }
  } catch (error) {
    logger.error({ err: error, contractAccountId, methodName }, 'Contract call error')
    throw new AppError(error.message, { code: 'CONTRACT_CALL_FAILED' })
  }
}

export async function viewContract(contractAccountId, methodName, args = {}) {
  try {
    const { near, network } = await setupNearConnection()

    logger.info({ contractAccountId, methodName }, 'Viewing contract')

    const account = await near.account(contractAccountId)
    const result = await account.viewFunction({
      contractId: contractAccountId,
      methodName,
      args,
    })

    return {
      success: true,
      result,
    }
  } catch (error) {
    logger.error({ err: error, contractAccountId, methodName }, 'Contract view error')
    throw new AppError(error.message, { code: 'CONTRACT_VIEW_FAILED' })
  }
}

export function areCredentialsConfigured() {
  return !!(config.nearAccountId && config.nearPrivateKey)
}
