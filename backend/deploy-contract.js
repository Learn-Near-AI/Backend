import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { connect, KeyPair, keyStores, Account, utils } from 'near-api-js'

const { parseNearAmount } = utils.format

const execAsync = promisify(exec)

/**
 * Setup NEAR credentials from environment variables
 * Expected env vars:
 * - NEAR_ACCOUNT_ID: The deployer account ID
 * - NEAR_PRIVATE_KEY: The private key for the account
 * - NEAR_NETWORK: testnet or mainnet (default: testnet)
 */
async function setupNearCredentials() {
  const accountId = process.env.NEAR_ACCOUNT_ID
  const privateKey = process.env.NEAR_PRIVATE_KEY
  const network = process.env.NEAR_NETWORK || 'testnet'
  
  if (!accountId || !privateKey) {
    throw new Error('NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY environment variables must be set')
  }
  
  // Create credentials directory
  const credentialsDir = join(homedir(), '.near-credentials', network)
  await mkdir(credentialsDir, { recursive: true })
  
  // Write credentials file
  const credentialsFile = join(credentialsDir, `${accountId}.json`)
  const credentials = {
    account_id: accountId,
    private_key: privateKey
  }
  
  await writeFile(credentialsFile, JSON.stringify(credentials, null, 2), 'utf-8')
  
  console.log(`✓ NEAR credentials configured for ${accountId} on ${network}`)
  
  return { accountId, network }
}

/**
 * Deploy a contract using NEAR CLI
 * 
 * @param {Buffer} wasmBuffer - The compiled WASM file as a buffer
 * @param {Object} options - Deployment options
 * @param {string} options.contractAccountId - Optional: specific contract account (defaults to deployer account)
 * @param {Object} options.initArgs - Optional: initialization arguments
 * @param {string} options.initMethod - Optional: initialization method name (default: 'new')
 * @returns {Promise<Object>} Deployment result
 */
export async function deployContract(wasmBuffer, options = {}) {
  const startTime = Date.now()
  let tempWasmPath = null
  
  try {
    // Setup credentials
    const { accountId, network } = await setupNearCredentials()
    
    // Determine contract account
    const contractAccountId = options.contractAccountId || accountId
    
    // Write WASM to temporary file
    tempWasmPath = join(process.cwd(), 'temp-builds', `deploy-${Date.now()}.wasm`)
    await mkdir(join(process.cwd(), 'temp-builds'), { recursive: true })
    await writeFile(tempWasmPath, wasmBuffer)
    
    console.log(`Deploying contract to ${contractAccountId} on ${network}...`)
    console.log(`WASM size: ${wasmBuffer.length} bytes`)
    
    // Deploy using NEAR CLI (use npx for cross-platform compatibility)
    // NEAR CLI 4.x syntax: near deploy <account-id> <wasm-file> --networkId <network>
    // Use --force to skip confirmation prompts
    const deployCommand = `npx near deploy ${contractAccountId} "${tempWasmPath}" --networkId ${network} --force`
    
    let deployResult
    try {
      deployResult = await execAsync(deployCommand, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000, // 2 minute timeout
        env: {
          ...process.env,
          NEAR_ENV: network
        }
      })
      console.log('Deploy stdout:', deployResult.stdout)
      if (deployResult.stderr) {
        console.log('Deploy stderr:', deployResult.stderr)
      }
    } catch (error) {
      throw new Error(`Deployment failed: ${error.message}\nStdout: ${error.stdout}\nStderr: ${error.stderr}`)
    }
    
    // Extract transaction hash from output
    // NEAR CLI output format: "Transaction Id <hash>"
    const txHashMatch = deployResult.stdout.match(/Transaction Id ([A-Za-z0-9]+)/) || 
                        deployResult.stderr.match(/Transaction Id ([A-Za-z0-9]+)/)
    const transactionHash = txHashMatch ? txHashMatch[1] : null
    
    // Initialize contract if initMethod and initArgs are provided
    let initResult = null
    let initialized = false
    if (options.initMethod) {
      const initMethodName = options.initMethod
      const initArgs = JSON.stringify(options.initArgs || {})
      
      console.log(`Initializing contract with ${initMethodName}(${initArgs})...`)
      
      const initCommand = `npx near call ${contractAccountId} ${initMethodName} --args '${initArgs}' --useAccount ${accountId} --networkId ${network}`
      
      try {
        initResult = await execAsync(initCommand, {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 60000,
          env: {
            ...process.env,
            NEAR_ENV: network
          }
        })
        console.log('Init stdout:', initResult.stdout)
        initialized = true
      } catch (error) {
        console.warn('Initialization failed (this may be normal if contract was already initialized):', error.message)
        // Don't throw - deployment succeeded even if init failed
        initResult = { error: error.message }
      }
    }
    
    // Clean up temp file
    if (tempWasmPath && existsSync(tempWasmPath)) {
      await rm(tempWasmPath, { force: true }).catch(() => {})
    }
    
    const deploymentTime = (Date.now() - startTime) / 1000
    
    return {
      success: true,
      contractId: contractAccountId,
      transactionHash,
      network,
      wasmSize: wasmBuffer.length,
      deploymentTime,
      explorerUrl: transactionHash ? `https://explorer.${network}.near.org/transactions/${transactionHash}` : null,
      accountUrl: `https://explorer.${network}.near.org/accounts/${contractAccountId}`,
      initialized,
      initError: initResult?.error || null
    }
    
  } catch (error) {
    console.error('Deployment error:', error)
    
    // Clean up temp file on error
    if (tempWasmPath && existsSync(tempWasmPath)) {
      await rm(tempWasmPath, { force: true }).catch(() => {})
    }
    
    throw {
      success: false,
      error: error.message,
      deploymentTime: (Date.now() - startTime) / 1000
    }
  }
}

/**
 * Call a contract method using NEAR CLI
 * 
 * @param {string} contractAccountId - The contract account ID
 * @param {string} methodName - The method to call
 * @param {Object} args - Method arguments
 * @param {Object} options - Call options
 * @param {string} options.accountId - Optional: caller account (defaults to deployer account)
 * @param {string} options.deposit - Optional: NEAR deposit amount (e.g., "1")
 * @param {string} options.gas - Optional: gas amount (e.g., "300000000000000")
 * @returns {Promise<Object>} Call result
 */
export async function callContract(contractAccountId, methodName, args = {}, options = {}) {
  try {
    const { accountId, network } = await setupNearCredentials()
    const callerAccountId = options.accountId || accountId
    
    const argsJson = JSON.stringify(args)
    let command = `npx near call ${contractAccountId} ${methodName} --args '${argsJson}' --useAccount ${callerAccountId} --networkId ${network}`
    
    // Add optional parameters
    if (options.deposit) {
      command += ` --deposit ${options.deposit}`
    }
    if (options.gas) {
      command += ` --gas ${options.gas}`
    }
    
    console.log(`Calling ${contractAccountId}.${methodName}(${argsJson})`)
    
    const result = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000,
      env: {
        ...process.env,
        NEAR_ENV: network
      }
    })
    
    // Try to parse the result from stdout
    let parsedResult = null
    try {
      // NEAR CLI outputs the result as the last line
      const lines = result.stdout.trim().split('\n')
      const lastLine = lines[lines.length - 1]
      parsedResult = JSON.parse(lastLine)
    } catch (e) {
      // If parsing fails, return raw output
      parsedResult = result.stdout
    }
    
    return {
      success: true,
      result: parsedResult,
      stdout: result.stdout,
      stderr: result.stderr
    }
  } catch (error) {
    console.error('Contract call error:', error)
    throw {
      success: false,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    }
  }
}

/**
 * View a contract method using NEAR CLI (read-only, no gas cost)
 * 
 * @param {string} contractAccountId - The contract account ID
 * @param {string} methodName - The view method to call
 * @param {Object} args - Method arguments
 * @returns {Promise<Object>} View result
 */
export async function viewContract(contractAccountId, methodName, args = {}) {
  try {
    const { network } = await setupNearCredentials()
    
    const argsJson = JSON.stringify(args)
    const command = `npx near view ${contractAccountId} ${methodName} --args '${argsJson}' --networkId ${network}`
    
    console.log(`Viewing ${contractAccountId}.${methodName}(${argsJson})`)
    
    const result = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
      env: {
        ...process.env,
        NEAR_ENV: network
      }
    })
    
    // Try to parse the result from stdout
    let parsedResult = null
    try {
      // NEAR CLI outputs the result as the last line
      const lines = result.stdout.trim().split('\n')
      const lastLine = lines[lines.length - 1]
      parsedResult = JSON.parse(lastLine)
    } catch (e) {
      // If parsing fails, return raw output
      parsedResult = result.stdout
    }
    
    return {
      success: true,
      result: parsedResult,
      stdout: result.stdout,
      stderr: result.stderr
    }
  } catch (error) {
    console.error('Contract view error:', error)
    throw {
      success: false,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    }
  }
}

/**
 * Check if NEAR credentials are configured
 */
export function areCredentialsConfigured() {
  return !!(process.env.NEAR_ACCOUNT_ID && process.env.NEAR_PRIVATE_KEY)
}

/**
 * Generate subaccount name with format: {user_id[:6]}-{project_id[:6]}-{timestamp}.{parent_account}
 */
function generateSubaccountName(userId, projectId, parentAccount, network = 'testnet') {
  const userPrefix = (userId || 'user').substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, '')
  const projectPrefix = (projectId || 'proj').substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, '')
  const timestamp = Date.now()
  // Parent account already includes .testnet or .near, so just append subaccount name
  return `${userPrefix}-${projectPrefix}-${timestamp}.${parentAccount}`
}

/**
 * Deploy contract to a new subaccount
 * Creates subaccount, transfers 2.0 NEAR, waits 2 seconds, deploys contract, sends 0.03 NEAR proof back
 * 
 * @param {Buffer} wasmBuffer - The compiled WASM file as a buffer
 * @param {Object} options - Deployment options
 * @param {string} options.userId - User ID for subaccount naming
 * @param {string} options.projectId - Project ID for subaccount naming
 * @param {Object} options.initArgs - Optional: initialization arguments
 * @param {string} options.initMethod - Optional: initialization method name (default: 'new')
 * @returns {Promise<Object>} Deployment result with comprehensive data
 */
export async function deployToSubaccount(wasmBuffer, options = {}) {
  const startTime = Date.now()
  let tempWasmPath = null
  let subaccountKeyPair = null
  let subaccountId = null
  
  try {
    // Setup parent account credentials
    const { accountId: parentAccountId, network } = await setupNearCredentials()
    
    // Generate subaccount name
    subaccountId = generateSubaccountName(options.userId, options.projectId, parentAccountId, network)
    console.log(`Creating subaccount: ${subaccountId}`)
    
    // Setup NEAR connection
    const keyStore = new keyStores.InMemoryKeyStore()
    const parentKeyPair = KeyPair.fromString(process.env.NEAR_PRIVATE_KEY)
    await keyStore.setKey(network, parentAccountId, parentKeyPair)
    
    // Generate keypair for subaccount
    subaccountKeyPair = KeyPair.fromRandom('ed25519')
    const subaccountPublicKey = subaccountKeyPair.getPublicKey()
    
    // Connect to NEAR using RPC endpoint
    // Using fastnear.com for testnet (reliable alternative to deprecated rpc.testnet.near.org)
    const near = await connect({
      networkId: network,
      keyStore,
      nodeUrl: network === 'mainnet' 
        ? 'https://rpc.mainnet.near.org' 
        : 'https://rpc.testnet.fastnear.com'
    })
    
    const parentAccount = await near.account(parentAccountId)
    
    // Transaction 1: Create account + add keys + transfer 3.0 NEAR (covers storage + deployment + proof transfer)
    console.log('Transaction 1: Creating subaccount with 3.0 NEAR...')
    const createAccountResult = await parentAccount.createAccount(
      subaccountId,
      subaccountPublicKey,
      parseNearAmount('3.0')
    )
    
    const createTxHash = createAccountResult.transaction.hash
    console.log(`✓ Subaccount created. Transaction: ${createTxHash}`)
    
    // Wait 2 seconds for account creation to finalize
    console.log('Waiting 2 seconds for account creation to finalize...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Setup subaccount credentials for deployment
    const credentialsDir = join(homedir(), '.near-credentials', network)
    await mkdir(credentialsDir, { recursive: true })
    const subaccountCredentialsFile = join(credentialsDir, `${subaccountId}.json`)
    await writeFile(subaccountCredentialsFile, JSON.stringify({
      account_id: subaccountId,
      private_key: subaccountKeyPair.toString()
    }, null, 2), 'utf-8')
    
    // Transaction 2: Deploy contract using subaccount's own keys via near-api-js
    console.log(`Transaction 2: Deploying contract to ${subaccountId}...`)
    console.log(`WASM size: ${wasmBuffer.length} bytes`)
    
    // Get subaccount and deploy contract
    const subaccountAccount = await near.account(subaccountId)
    await keyStore.setKey(network, subaccountId, subaccountKeyPair)
    
    const deployResult = await subaccountAccount.deployContract(wasmBuffer)
    const deployTxHash = deployResult.transaction.hash
    console.log(`✓ Contract deployed. Transaction: ${deployTxHash}`)
    
    // Initialize contract if needed
    let initResult = null
    let initialized = false
    if (options.initMethod) {
      const initMethodName = options.initMethod
      const initArgs = options.initArgs || {}
      
      console.log(`Initializing contract with ${initMethodName}(${JSON.stringify(initArgs)})...`)
      
      try {
        await subaccountAccount.functionCall({
          contractId: subaccountId,
          methodName: initMethodName,
          args: initArgs
        })
        initialized = true
        console.log('✓ Contract initialized')
      } catch (error) {
        console.warn('Initialization failed:', error.message)
        initResult = { error: error.message }
      }
    }
    
    // Transaction 3: Send proof-of-deployment transfer (0.03 NEAR back to parent)
    console.log('Transaction 3: Sending 0.03 NEAR proof transfer to parent account...')
    
    const proofTransferResult = await subaccountAccount.sendMoney(
      parentAccountId,
      parseNearAmount('0.03')
    )
    const proofTxHash = proofTransferResult.transaction.hash
    console.log(`✓ Proof transfer sent. Transaction: ${proofTxHash}`)
    
    // Get gas used from deployment transaction (if available)
    let gasUsed = null
    try {
      const txStatus = await near.connection.provider.txStatus(deployTxHash, subaccountId)
      if (txStatus.receipts_outcome) {
        const totalGas = txStatus.receipts_outcome.reduce((sum, receipt) => {
          return sum + (receipt.outcome.gas_burnt || 0)
        }, 0)
        gasUsed = totalGas.toString()
      }
    } catch (e) {
      console.warn('Could not fetch gas information:', e.message)
    }
    
    // Clean up temp file
    if (tempWasmPath && existsSync(tempWasmPath)) {
      await rm(tempWasmPath, { force: true }).catch(() => {})
    }
    
    const deploymentTime = (Date.now() - startTime) / 1000
    
    return {
      success: true,
      contractId: subaccountId,
      parentAccountId,
      network,
      wasmSize: wasmBuffer.length,
      deploymentTime,
      transactions: {
        createAccount: {
          hash: createTxHash,
          url: `https://explorer.${network}.near.org/transactions/${createTxHash}`
        },
        deploy: {
          hash: deployTxHash,
          url: deployTxHash ? `https://explorer.${network}.near.org/transactions/${deployTxHash}` : null
        },
        proofTransfer: {
          hash: proofTxHash,
          url: `https://explorer.${network}.near.org/transactions/${proofTxHash}`
        }
      },
      explorerUrl: deployTxHash ? `https://explorer.${network}.near.org/transactions/${deployTxHash}` : null,
      accountUrl: `https://explorer.${network}.near.org/accounts/${subaccountId}`,
      gasUsed,
      initialized,
      initError: initResult?.error || null
    }
    
  } catch (error) {
    console.error('Subaccount deployment error:', error)
    
    // Clean up temp file on error
    if (tempWasmPath && existsSync(tempWasmPath)) {
      await rm(tempWasmPath, { force: true }).catch(() => {})
    }
    
    throw {
      success: false,
      error: error.message,
      deploymentTime: (Date.now() - startTime) / 1000,
      subaccountId: subaccountId || null
    }
  }
}

