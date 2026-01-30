import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { buildContract } from './build-contract.js'
import { buildRustContract, warmupSharedTarget } from './build-rust-contract.js'
import { deployContract, deployToSubaccount, callContract, viewContract } from './deploy-contract.js'

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
    // Credentials are hardcoded, always available

    const { wasmBase64, contractAccountId, initMethod, initArgs, useSubaccount, userId, projectId } = req.body

    if (!wasmBase64) {
      return res.status(400).json({ error: 'Missing wasmBase64' })
    }

    // Convert base64 to buffer
    const wasmBuffer = Buffer.from(wasmBase64, 'base64')

    // Deploy to subaccount if requested
    if (useSubaccount) {
      console.log('Deploying contract to subaccount...')
      const result = await deployToSubaccount(wasmBuffer, {
        userId: userId || 'user',
        projectId: projectId || 'project',
        initMethod: initMethod || 'new',
        initArgs: initArgs || {}
      })
      return res.json(result)
    }

    // Standard deployment
    console.log('Deploying contract via NEAR CLI...')
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
  res.json({
    configured: true,
    accountId: 'softquiche5250.testnet',
    network: 'testnet',
    message: 'NEAR CLI is configured and ready'
  })
})

// Start server: listen on 0.0.0.0 so Fly.io proxy can reach us; warmup in background
async function startServer() {
  const host = '0.0.0.0'
  app.listen(PORT, host, () => {
    console.log(`🚀 Backend server running on http://${host}:${PORT}`)
    console.log(`📦 Compile endpoint: POST http://localhost:${PORT}/api/compile`)
    console.log(`🚢 Deploy endpoint: POST http://localhost:${PORT}/api/deploy`)
    console.log(`📞 Call endpoint: POST http://localhost:${PORT}/api/contract/call`)
    console.log(`👁️  View endpoint: POST http://localhost:${PORT}/api/contract/view`)
    console.log(`🔍 NEAR Status: GET http://localhost:${PORT}/api/near/status`)
    console.log(`✅ NEAR CLI configured for account: softquiche5250.testnet on testnet`)
  })
  // Pre-warm Rust target in background so first request isn't slow; don't block startup
  warmupSharedTarget().catch((err) => {
    console.warn('Pre-warm skipped or failed (first Rust compile may be slow):', err.message)
  })
}
startServer()


