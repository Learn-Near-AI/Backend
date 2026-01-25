import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { buildContract, initializeTemplate } from './build-contract-optimized.js'
import { buildRustContract } from './build-rust-contract.js'
import { deployContract, callContract, viewContract, areCredentialsConfigured } from './deploy-contract.js'

// DEVELOPMENT ONLY: Hardcoded NEAR credentials
// WARNING: Never commit real credentials to production code
process.env.NEAR_ACCOUNT_ID = 'wisdomfornear.testnet'
process.env.NEAR_PRIVATE_KEY = 'ed25519:2pw2KaFjCbXDFRmL18KFoUUUiaVDFi6499DrWdbGTh2uH4n2KgE3Pv67BwsB98gLuuFxJkdPRY2gbgTf5N36MnVj'
process.env.NEAR_NETWORK = 'testnet'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// CORS configuration - allow all origins for now
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}))
app.use(express.json({ limit: '10mb' }))

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Compile contract endpoint
app.post('/api/compile', async (req, res) => {
  try {
    const { code, language, projectId } = req.body

    if (!code || !language) {
      return res.status(400).json({ error: 'Missing code or language' })
    }

    if (!['JavaScript', 'TypeScript', 'Rust'].includes(language)) {
      return res.status(400).json({ error: 'Unsupported language. Use JavaScript, TypeScript, or Rust' })
    }

    console.log(`Compiling ${language} contract...`)

    if (language === 'Rust') {
      try {
        const result = await buildRustContract(code, projectId)
        
        res.json({
          success: result.success,
          exit_code: result.exit_code,
          stdout: result.stdout,
          stderr: result.stderr,
          wasm: result.wasm,
          size: result.wasmSize,
          abi: result.abi,
          compilation_time: result.compilation_time,
          details: {
            status: result.success ? 'success' : 'failed',
            compilation_time: result.compilation_time,
            project_path: result.project_path,
            wasm_size: result.wasmSize,
            optimized: true
          }
        })
      } catch (error) {
        // Error object from buildRustContract
        res.status(500).json({
          success: false,
          exit_code: error.exit_code || -1,
          stdout: error.stdout || '',
          stderr: error.stderr || error.error || error.message,
          wasm: null,
          size: 0,
          abi: null,
          compilation_time: error.compilation_time || 0,
          error: error.error || error.message,
          details: {
            status: 'failed',
            compilation_time: error.compilation_time || 0,
            project_path: error.project_path || '',
            wasm_size: 0,
            optimized: false
          }
        })
      }
    } else {
      // JavaScript/TypeScript compilation (existing code)
      const wasmBuffer = await buildContract(code, language)

      // Convert buffer to base64 for sending over HTTP
      const wasmBase64 = wasmBuffer.toString('base64')

      res.json({
        success: true,
        wasm: wasmBase64,
        size: wasmBuffer.length,
      })
    }
  } catch (error) {
    console.error('Compilation error:', error)
    res.status(500).json({
      error: 'Compilation failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })
  }
})

// Deploy contract endpoint
app.post('/api/deploy', async (req, res) => {
  try {
    // Check if credentials are configured
    if (!areCredentialsConfigured()) {
      return res.status(503).json({ 
        success: false,
        error: 'NEAR CLI deployment not configured. Please set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY environment variables.' 
      })
    }

    const { wasmBase64, contractAccountId, initMethod, initArgs } = req.body

    if (!wasmBase64) {
      return res.status(400).json({ error: 'Missing wasmBase64' })
    }

    console.log('Deploying contract via NEAR CLI...')

    // Convert base64 to buffer
    const wasmBuffer = Buffer.from(wasmBase64, 'base64')

    // Deploy contract
    const result = await deployContract(wasmBuffer, {
      contractAccountId,
      initMethod: initMethod || 'new',
      initArgs: initArgs || {}
    })

    res.json(result)
  } catch (error) {
    console.error('Deployment error:', error)
    res.status(500).json({
      success: false,
      error: error.error || error.message,
      details: error
    })
  }
})

// Call contract method endpoint
app.post('/api/contract/call', async (req, res) => {
  try {
    if (!areCredentialsConfigured()) {
      return res.status(503).json({ 
        success: false,
        error: 'NEAR CLI not configured. Please set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY environment variables.' 
      })
    }

    const { contractAccountId, methodName, args, accountId, deposit, gas } = req.body

    if (!contractAccountId || !methodName) {
      return res.status(400).json({ error: 'Missing contractAccountId or methodName' })
    }

    console.log(`Calling contract: ${contractAccountId}.${methodName}`)

    const result = await callContract(contractAccountId, methodName, args || {}, { 
      accountId, 
      deposit, 
      gas 
    })
    
    res.json(result)
  } catch (error) {
    console.error('Contract call error:', error)
    res.status(500).json({
      success: false,
      error: error.error || error.message,
      stdout: error.stdout,
      stderr: error.stderr
    })
  }
})

// View contract method endpoint (read-only)
app.post('/api/contract/view', async (req, res) => {
  try {
    if (!areCredentialsConfigured()) {
      return res.status(503).json({ 
        success: false,
        error: 'NEAR CLI not configured. Please set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY environment variables.' 
      })
    }

    const { contractAccountId, methodName, args } = req.body

    if (!contractAccountId || !methodName) {
      return res.status(400).json({ error: 'Missing contractAccountId or methodName' })
    }

    console.log(`Viewing contract: ${contractAccountId}.${methodName}`)

    const result = await viewContract(contractAccountId, methodName, args || {})
    
    res.json(result)
  } catch (error) {
    console.error('Contract view error:', error)
    res.status(500).json({
      success: false,
      error: error.error || error.message,
      stdout: error.stdout,
      stderr: error.stderr
    })
  }
})

// Check NEAR CLI configuration status
app.get('/api/near/status', (req, res) => {
  const configured = areCredentialsConfigured()
  res.json({
    configured,
    accountId: configured ? process.env.NEAR_ACCOUNT_ID : null,
    network: process.env.NEAR_NETWORK || 'testnet',
    message: configured 
      ? 'NEAR CLI is configured and ready' 
      : 'NEAR CLI not configured. Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY environment variables.'
  })
})

// Start server with template initialization
// Listen on 0.0.0.0 to allow connections from Windows when running in WSL
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`)
  console.log(`   Also accessible from Windows at: http://172.28.200.112:${PORT}`)
  console.log(`📦 Compile endpoint: POST http://localhost:${PORT}/api/compile`)
  console.log(`🚢 Deploy endpoint: POST http://localhost:${PORT}/api/deploy`)
  console.log(`📞 Call endpoint: POST http://localhost:${PORT}/api/contract/call`)
  console.log(`👁️  View endpoint: POST http://localhost:${PORT}/api/contract/view`)
  console.log(`🔍 NEAR Status: GET http://localhost:${PORT}/api/near/status`)
  
  // Initialize contract template for optimized builds
  try {
    console.log('📦 Initializing contract template (this happens once)...')
    await initializeTemplate()
    console.log('✅ Contract template initialized successfully')
  } catch (error) {
    if (error.message.includes('Windows') || error.message.includes('not supported')) {
      console.warn(`⚠️  JavaScript/TypeScript compilation not available on Windows`)
      console.warn(`   ${error.message}`)
      console.warn('   This is expected. The server will still run, but JS/TS compilation will fail gracefully.')
    } else {
      console.warn(`⚠️  Template initialization failed: ${error.message}`)
      console.warn('   JavaScript/TypeScript compilation may be slower on first build')
    }
  }
  
  if (areCredentialsConfigured()) {
    console.log(`✅ NEAR CLI configured for account: ${process.env.NEAR_ACCOUNT_ID} on ${process.env.NEAR_NETWORK || 'testnet'}`)
  } else {
    console.log(`⚠️  NEAR CLI not configured. Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY to enable deployment.`)
  }
})


