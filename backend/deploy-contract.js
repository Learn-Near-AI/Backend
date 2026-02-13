import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { homedir } from 'os'

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

