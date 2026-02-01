import { writeFile, mkdir, readFile, rm, cp, chmod, readdir } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { platform } from 'os'

const execAsync = promisify(exec)

// Detect if running in WSL (Windows mount path)
const isWSL = platform() === 'linux' && process.cwd().startsWith('/mnt/')
// Use WSL-native temp directory to avoid permission issues with Windows mounts
const BASE_DIR = isWSL ? '/tmp/near-builds' : process.cwd()

// Configuration for optimization
const TEMPLATE_DIR = join(BASE_DIR, 'contract-template')
const BUILD_POOL_SIZE = 5 // Number of persistent build directories
const BUILD_POOL_DIR = join(BASE_DIR, 'build-pool')

// Build pool management - simple round-robin with lock files
let currentBuildIndex = 0
const buildLocks = new Map()

// Check if near-sdk-js is available (it doesn't support Windows)
function isNearSdkJsAvailable() {
  try {
    // Check if near-sdk-js module exists in template or main node_modules
    const nearSdkPath = join(process.cwd(), 'node_modules', 'near-sdk-js')
    const templateSdkPath = join(TEMPLATE_DIR, 'node_modules', 'near-sdk-js')
    return existsSync(nearSdkPath) || existsSync(templateSdkPath)
  } catch (error) {
    return false
  }
}

/**
 * Initialize the template directory with near-sdk-js pre-installed
 * This runs once at startup to create a reusable template
 * Matches the experiment/auction approach exactly
 */
export async function initializeTemplate() {
  // Check for Windows - near-sdk-js doesn't support Windows
  if (platform() === 'win32') {
    throw new Error(
      'JavaScript/TypeScript compilation is not supported on Windows. ' +
      'near-sdk-js requires a Linux/Mac environment. ' +
      'This feature will work when deployed to fly.io (Linux). ' +
      'For local development on Windows, please use Rust for smart contracts.'
    )
  }

  if (existsSync(TEMPLATE_DIR)) {
    // Verify that template is actually initialized (not just directory exists)
    const nearSdkPath = join(TEMPLATE_DIR, 'node_modules', 'near-sdk-js')
    const qjscPath = join(nearSdkPath, 'lib', 'cli', 'deps', 'qjsc')
    const wasiSdkPath = join(nearSdkPath, 'lib', 'cli', 'deps', 'wasi-sdk')
    
    if (existsSync(nearSdkPath) && existsSync(qjscPath) && existsSync(wasiSdkPath)) {
      console.log('✓ Template directory already exists and is properly initialized')
      return
    } else {
      console.log('⚠️  Template directory exists but is incomplete. Reinitializing...')
      // Remove incomplete template
      await rm(TEMPLATE_DIR, { recursive: true, force: true }).catch(() => {})
    }
  }

  console.log('📦 Initializing contract template directory...')
  if (isWSL) {
    console.log(`   Using WSL-native directory: ${TEMPLATE_DIR}`)
  }
  const startTime = Date.now()

  try {
    // Ensure base directory exists (important for WSL)
    await mkdir(BASE_DIR, { recursive: true })
    await mkdir(TEMPLATE_DIR, { recursive: true })
    await mkdir(join(TEMPLATE_DIR, 'src'), { recursive: true })
    await mkdir(join(TEMPLATE_DIR, 'build'), { recursive: true })

    // Create package.json - matching experiment/auction exactly
    const packageJson = {
      name: "near-contract-template",
      version: "1.0.0",
      type: "module",
      scripts: {
        build: "near-sdk-js build src/contract.js build/contract.wasm"
      },
      dependencies: {
        "near-sdk-js": "2.0.0"
      }
    }
    await writeFile(
      join(TEMPLATE_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    )

    // Create minimal tsconfig.json - matching experiment/auction
    const tsconfig = {
      compilerOptions: {
        experimentalDecorators: true,
        target: "ES5",
        noEmit: true,
        noImplicitAny: false,
      },
      files: [
        "src/contract.ts"
      ],
      exclude: [
        "node_modules"
      ]
    }
    await writeFile(
      join(TEMPLATE_DIR, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2),
      'utf-8'
    )

    // Create a dummy contract file
    const dummyContract = `import { NearBindgen, near, call, view } from 'near-sdk-js';

@NearBindgen({})
class Template {
  @view({}) 
  dummy() { 
    return "template"; 
  }
}`
    await writeFile(join(TEMPLATE_DIR, 'src', 'contract.js'), dummyContract, 'utf-8')

    // Install near-sdk-js ONCE - matching experiment/auction approach
    console.log('📦 Installing near-sdk-js in template (this happens once)...')
    try {
      // Try installing with postinstall scripts (needed for qjsc compiler)
      // If it fails, check if node_modules was created anyway
      let installResult
      try {
        installResult = await execAsync('npm install --legacy-peer-deps --no-audit --no-fund', {
          cwd: TEMPLATE_DIR,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 600000 // 10 minutes for postinstall script
        })
      } catch (installError) {
        // Check if installation partially succeeded despite postinstall failure
        const nearSdkPath = join(TEMPLATE_DIR, 'node_modules', 'near-sdk-js')
        if (existsSync(nearSdkPath)) {
          console.log('⚠️  npm install had errors, but near-sdk-js package exists. Attempting to run postinstall manually...')
          // Try to run postinstall manually
          try {
            await execAsync('node lib/cli/post-install.js', {
              cwd: nearSdkPath,
              maxBuffer: 10 * 1024 * 1024,
              timeout: 300000 // 5 minutes
            })
            console.log('✓ Postinstall script completed')
          } catch (postinstallError) {
            console.warn('⚠️  Postinstall script failed, but continuing anyway:', postinstallError.message.substring(0, 200))
          }
        } else {
          throw installError
        }
      }
      if (installResult && installResult.stdout) {
        console.log('npm install output:', installResult.stdout.substring(0, 500))
      }
    } catch (installError) {
      // Check if node_modules was actually created (npm might succeed despite warnings)
      const nodeModulesPath = join(TEMPLATE_DIR, 'node_modules', 'near-sdk-js')
      if (existsSync(nodeModulesPath)) {
        console.log('✓ near-sdk-js installed successfully (warnings ignored)')
      } else {
        const errorMsg = installError.message || 'Unknown error'
        const stdout = installError.stdout ? installError.stdout.toString().substring(0, 1000) : ''
        const stderr = installError.stderr ? installError.stderr.toString().substring(0, 1000) : ''
        console.error('npm install failed:', errorMsg)
        if (stdout) console.error('STDOUT:', stdout)
        if (stderr) console.error('STDERR:', stderr)
        throw installError
      }
    }
    
    // Verify installation
    const nearSdkPath = join(TEMPLATE_DIR, 'node_modules', 'near-sdk-js')
    if (!existsSync(nearSdkPath)) {
      throw new Error('near-sdk-js was not installed. node_modules/near-sdk-js does not exist.')
    }
    
    // Verify critical dependencies exist (qjsc, wasi-sdk, quickjs, binaryen)
    const depsDir = join(nearSdkPath, 'lib', 'cli', 'deps')
    const qjscPath = join(depsDir, 'qjsc')
    const wasiSdkPath = join(depsDir, 'wasi-sdk')
    const quickjsPath = join(depsDir, 'quickjs')
    const binaryenPath = join(depsDir, 'binaryen')
    const clangPath = join(wasiSdkPath, 'bin', 'clang')
    
    const missingDeps = []
    if (!existsSync(qjscPath)) missingDeps.push('qjsc')
    if (!existsSync(wasiSdkPath)) missingDeps.push('wasi-sdk')
    if (!existsSync(quickjsPath)) missingDeps.push('quickjs')
    if (!existsSync(binaryenPath)) missingDeps.push('binaryen')
    
    if (missingDeps.length > 0) {
      console.log(`⚠️  Missing dependencies: ${missingDeps.join(', ')}. Running postinstall script...`)
      try {
        const postinstallResult = await execAsync('node lib/cli/post-install.js', {
          cwd: nearSdkPath,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 600000 // 10 minutes for full installation
        })
        if (postinstallResult.stdout) {
          console.log('Postinstall output:', postinstallResult.stdout.substring(0, 500))
        }
        console.log('✓ Postinstall script completed')
        
        // Verify all dependencies exist now
        const stillMissing = []
        if (!existsSync(qjscPath)) stillMissing.push('qjsc')
        if (!existsSync(wasiSdkPath)) stillMissing.push('wasi-sdk')
        if (!existsSync(quickjsPath)) stillMissing.push('quickjs')
        if (!existsSync(binaryenPath)) stillMissing.push('binaryen')
        
        if (stillMissing.length > 0) {
          throw new Error(`Dependencies still missing after postinstall: ${stillMissing.join(', ')}. near-sdk-js installation may be incomplete.`)
        }
      } catch (postinstallError) {
        const errorMsg = postinstallError.message || 'Unknown error'
        const stdout = postinstallError.stdout ? postinstallError.stdout.toString().substring(0, 2000) : ''
        const stderr = postinstallError.stderr ? postinstallError.stderr.toString().substring(0, 2000) : ''
        console.error('Postinstall script failed:', errorMsg)
        if (stdout) console.error('STDOUT:', stdout)
        if (stderr) console.error('STDERR:', stderr)
        throw new Error(`Template initialization failed: Missing dependencies (${missingDeps.join(', ')}) and postinstall script failed: ${errorMsg}`)
      }
    }
    
    // Ensure qjsc is executable
    if (existsSync(qjscPath)) {
      try {
        await chmod(qjscPath, 0o755)
      } catch (e) {
        console.warn('⚠️  Could not set qjsc permissions:', e.message)
      }
    }
    
    // Ensure clang is executable
    if (existsSync(clangPath)) {
      try {
        await chmod(clangPath, 0o755)
      } catch (e) {
        console.warn('⚠️  Could not set clang permissions:', e.message)
      }
    }

    const initTime = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`✓ Template initialized in ${initTime}s`)
    console.log(`✓ Template location: ${TEMPLATE_DIR}`)
    console.log(`✓ qjsc binary verified at: ${qjscPath}`)
    console.log(`✓ wasi-sdk verified at: ${wasiSdkPath}`)
    console.log(`✓ quickjs verified at: ${quickjsPath}`)
    console.log(`✓ binaryen verified at: ${binaryenPath}`)
  } catch (error) {
    console.error('Failed to initialize template:', error.message)
    // Clean up on failure
    await rm(TEMPLATE_DIR, { recursive: true, force: true }).catch(() => {})
    throw new Error(`Template initialization failed: ${error.message}`)
  }
}

/**
 * Initialize the build pool directories
 */
async function initializeBuildPool() {
  await mkdir(BUILD_POOL_DIR, { recursive: true })
  
  for (let i = 0; i < BUILD_POOL_SIZE; i++) {
    const buildDir = join(BUILD_POOL_DIR, `build-${i}`)
    if (!existsSync(buildDir)) {
      await mkdir(buildDir, { recursive: true })
    }
  }
}

/**
 * Get an available build directory from the pool
 * Uses simple round-robin selection with lock checking
 */
async function acquireBuildDirectory() {
  await initializeBuildPool()

  // Try to find an unlocked directory
  for (let attempts = 0; attempts < BUILD_POOL_SIZE * 2; attempts++) {
    const index = currentBuildIndex % BUILD_POOL_SIZE
    currentBuildIndex++
    
    const buildDir = join(BUILD_POOL_DIR, `build-${index}`)
    const lockFile = join(buildDir, '.lock')
    
    // Check if locked
    if (buildLocks.get(buildDir) || existsSync(lockFile)) {
      continue
    }
    
    // Acquire lock
    buildLocks.set(buildDir, true)
    try {
      await writeFile(lockFile, Date.now().toString(), 'utf-8')
    } catch (e) {
      buildLocks.delete(buildDir)
      continue
    }
    
    return { buildDir, index }
  }
  
  // If all are locked, create a temporary directory
  const tempIndex = Date.now()
  const buildDir = join(BUILD_POOL_DIR, `build-temp-${tempIndex}`)
  await mkdir(buildDir, { recursive: true })
  buildLocks.set(buildDir, true)
  
  return { buildDir, index: tempIndex, isTemp: true }
}

/**
 * Release a build directory back to the pool
 */
async function releaseBuildDirectory(buildDir, isTemp) {
  const lockFile = join(buildDir, '.lock')
  
  // Clean up build artifacts but keep node_modules
  try {
    await rm(join(buildDir, 'build'), { recursive: true, force: true })
    await rm(join(buildDir, 'src'), { recursive: true, force: true })
    await rm(lockFile, { force: true })
  } catch (e) {
    // Ignore cleanup errors
  }
  
  // Remove from locks
  buildLocks.delete(buildDir)
  
  // If it's a temporary directory, delete it completely
  if (isTemp) {
    await rm(buildDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Copy template to build directory (much faster than npm install)
 */
async function copyTemplateToDir(buildDir, language) {
  const nodeModulesInBuild = join(buildDir, 'node_modules')
  
  // Check if node_modules already exists in the build directory
  if (existsSync(nodeModulesInBuild)) {
    console.log('✓ Using cached node_modules')
    // Just copy the config files
    await cp(join(TEMPLATE_DIR, 'package.json'), join(buildDir, 'package.json'))
    await cp(join(TEMPLATE_DIR, 'tsconfig.json'), join(buildDir, 'tsconfig.json'))
  } else {
    // Copy node_modules from template (first time for this build dir)
    console.log('📦 Copying template dependencies...')
    const copyStartTime = Date.now()
    
    // Verify critical dependencies exist in template before copying
    const templateDepsDir = join(TEMPLATE_DIR, 'node_modules', 'near-sdk-js', 'lib', 'cli', 'deps')
    const templateQjscPath = join(templateDepsDir, 'qjsc')
    const templateWasiSdkPath = join(templateDepsDir, 'wasi-sdk')
    const templateQuickjsPath = join(templateDepsDir, 'quickjs')
    const templateBinaryenPath = join(templateDepsDir, 'binaryen')
    
    const missingInTemplate = []
    if (!existsSync(templateQjscPath)) missingInTemplate.push('qjsc')
    if (!existsSync(templateWasiSdkPath)) missingInTemplate.push('wasi-sdk')
    if (!existsSync(templateQuickjsPath)) missingInTemplate.push('quickjs')
    if (!existsSync(templateBinaryenPath)) missingInTemplate.push('binaryen')
    
    if (missingInTemplate.length > 0) {
      throw new Error(`Critical dependencies missing in template: ${missingInTemplate.join(', ')}. Template may not be initialized correctly. Please restart the server to reinitialize the template.`)
    }
    
    await cp(join(TEMPLATE_DIR, 'node_modules'), nodeModulesInBuild, { 
      recursive: true,
      force: true
    })
    
    // Ensure critical dependencies exist and are executable (fs.promises.cp may not preserve permissions)
    const depsDir = join(nodeModulesInBuild, 'near-sdk-js', 'lib', 'cli', 'deps')
    
    // Verify and copy qjsc
    const qjscPath = join(depsDir, 'qjsc')
    if (!existsSync(qjscPath) && existsSync(templateQjscPath)) {
      console.warn('⚠️  qjsc not found after copy, copying explicitly...')
      await mkdir(depsDir, { recursive: true })
      await cp(templateQjscPath, qjscPath, { force: true })
    }
    if (existsSync(qjscPath)) {
      try {
        await chmod(qjscPath, 0o755) // rwxr-xr-x
      } catch (e) {
        console.warn('⚠️  Could not set qjsc permissions:', e.message)
      }
    }
    
    // Verify and copy wasi-sdk (entire directory)
    const wasiSdkPath = join(depsDir, 'wasi-sdk')
    if (!existsSync(wasiSdkPath) && existsSync(templateWasiSdkPath)) {
      console.warn('⚠️  wasi-sdk not found after copy, copying explicitly...')
      await cp(templateWasiSdkPath, wasiSdkPath, { recursive: true, force: true })
    }
    // Ensure clang is executable
    const clangPath = join(wasiSdkPath, 'bin', 'clang')
    if (existsSync(clangPath)) {
      try {
        await chmod(clangPath, 0o755)
      } catch (e) {
        console.warn('⚠️  Could not set clang permissions:', e.message)
      }
    }
    
    // Verify and copy quickjs (entire directory)
    const quickjsPath = join(depsDir, 'quickjs')
    if (!existsSync(quickjsPath) && existsSync(templateQuickjsPath)) {
      console.warn('⚠️  quickjs not found after copy, copying explicitly...')
      await cp(templateQuickjsPath, quickjsPath, { recursive: true, force: true })
    }
    
    // Verify and copy binaryen (entire directory)
    const binaryenPath = join(depsDir, 'binaryen')
    if (!existsSync(binaryenPath) && existsSync(templateBinaryenPath)) {
      console.warn('⚠️  binaryen not found after copy, copying explicitly...')
      await cp(templateBinaryenPath, binaryenPath, { recursive: true, force: true })
    }
    
    await cp(join(TEMPLATE_DIR, 'package.json'), join(buildDir, 'package.json'))
    await cp(join(TEMPLATE_DIR, 'tsconfig.json'), join(buildDir, 'tsconfig.json'))
    
    const copyTime = ((Date.now() - copyStartTime) / 1000).toFixed(2)
    console.log(`✓ Dependencies copied in ${copyTime}s`)
  }
}

/**
 * Builds a NEAR contract from JavaScript/TypeScript source code
 * Uses build pool: reuses node_modules in pool dirs to avoid copying on every request.
 * 
 * @param {string} sourceCode - The contract source code
 * @param {string} language - 'JavaScript' or 'TypeScript'
 * @returns {Promise<Buffer>} The compiled .wasm file as a Buffer
 */
export async function buildContract(sourceCode, language) {
  // Verify template exists
  if (!existsSync(TEMPLATE_DIR)) {
    throw new Error(`Template directory not found: ${TEMPLATE_DIR}. Please ensure template is initialized.`)
  }

  const startTime = Date.now()
  let buildDir = null
  let isTemp = false

  try {
    // Acquire a pool directory (reuses node_modules when present; only copies config + src on reuse)
    const { buildDir: acquiredDir, isTemp: acquiredIsTemp } = await acquireBuildDirectory()
    buildDir = acquiredDir
    isTemp = acquiredIsTemp === true

    console.log(`Building ${language} contract in ${buildDir}`)

    // Copy template: full copy only when node_modules missing (first use of this dir); otherwise just config files
    await copyTemplateToDir(buildDir, language)

    // Ensure src and build exist (releaseBuildDirectory removes them between uses)
    await mkdir(join(buildDir, 'src'), { recursive: true })
    await mkdir(join(buildDir, 'build'), { recursive: true })

    // Always use JavaScript pipeline (treat as JS-only; TypeScript should be transpiled before reaching backend)
    const ext = '.js'
    const contractFile = join(buildDir, 'src', `contract${ext}`)
    await writeFile(contractFile, sourceCode, 'utf-8')
    console.log(`✓ Contract code written to: ${contractFile}`)

    // Update package.json build script to use contract.js
    const packageJsonPath = join(buildDir, 'package.json')
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))
    packageJson.scripts.build = `near-sdk-js build src/contract.js build/contract.wasm`
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8')

    // Ensure clang and qjsc are executable (template/pool may already have correct permissions)
    const depsDir = join(buildDir, 'node_modules', 'near-sdk-js', 'lib', 'cli', 'deps')
    const clangPath = join(depsDir, 'wasi-sdk', 'bin', 'clang')
    const qjscPath = join(depsDir, 'qjsc')
    if (existsSync(clangPath)) {
      try { await chmod(clangPath, 0o755) } catch (e) { /* ignore */ }
    }
    if (existsSync(qjscPath)) {
      try { await chmod(qjscPath, 0o755) } catch (e) { /* ignore */ }
    }

    // Build using near-sdk-js
    console.log(`Running npm run build in ${buildDir}...`)
    const buildStartTime = Date.now()
    const buildResult = await execAsync(`npm run build`, {
      cwd: buildDir,
      maxBuffer: 50 * 1024 * 1024,
      timeout: 240000,
      env: process.env
    })
    const buildTime = ((Date.now() - buildStartTime) / 1000).toFixed(2)
    console.log(`✓ Build completed in ${buildTime}s`)

    if (buildResult.stdout && buildResult.stdout.length < 500) {
      console.log('Build output:', buildResult.stdout)
    }

    const compilationTime = (Date.now() - startTime) / 1000
    console.log(`✓ ${language} compilation completed in ${compilationTime.toFixed(2)}s`)

    const wasmPath = join(buildDir, 'build', 'contract.wasm')
    if (!existsSync(wasmPath)) {
      throw new Error(`WASM file not found at ${wasmPath}. Build may have failed.`)
    }
    const wasmBuffer = await readFile(wasmPath)
    console.log(`✓ WASM size: ${wasmBuffer.length} bytes`)

    await releaseBuildDirectory(buildDir, isTemp)
    if (!isTemp) {
      console.log(`✓ Released build directory back to pool`)
    }

    return wasmBuffer
  } catch (error) {
    if (buildDir != null) {
      await releaseBuildDirectory(buildDir, isTemp).catch(() => {})
    }

    // Extract useful information from stderr and stdout
    const stderr = error.stderr ? error.stderr.toString() : ''
    const stdout = error.stdout ? error.stdout.toString() : ''
    
    // Log full error for debugging
    console.error(`✗ ${language} compilation failed with error:`)
    console.error(`  Message: ${error.message}`)
    console.error(`  Exit code: ${error.code || 'unknown'}`)
    if (stdout) {
      // Show more of stdout since near-sdk-js often puts errors there
      const stdoutPreview = stdout.length > 5000 ? stdout.slice(-5000) : stdout
      console.error(`  STDOUT (last ${stdoutPreview.length} chars):\n${stdoutPreview}`)
    }
    if (stderr) {
      const stderrPreview = stderr.length > 5000 ? stderr.slice(-5000) : stderr
      console.error(`  STDERR (last ${stderrPreview.length} chars):\n${stderrPreview}`)
    }
    
    // Provide more helpful error messages
    let errorMessage = error.message || 'Unknown error'
    
    // Look for common error patterns
    if (stderr.includes('SyntaxError') || stdout.includes('SyntaxError')) {
      const syntaxMatch = (stderr + stdout).match(/SyntaxError: (.+?)(\n|$)/)
      if (syntaxMatch) {
        errorMessage = `Syntax Error: ${syntaxMatch[1]}`
      }
    } else if (stderr.includes('Error:') || stdout.includes('Error:')) {
      const errorMatch = (stderr + stdout).match(/Error: (.+?)(\n|$)/)
      if (errorMatch) {
        errorMessage = errorMatch[1]
      }
    } else if (stderr) {
      // If we have stderr, use the last meaningful line
      const stderrLines = stderr.split('\n').filter(line => line.trim().length > 0)
      if (stderrLines.length > 0) {
        errorMessage = stderrLines[stderrLines.length - 1]
      }
    }
    
    // Include relevant parts of stderr and stdout for debugging
    const relevantStderr = stderr.length > 0 ? stderr.slice(-1000) : ''
    const relevantStdout = stdout.length > 0 ? stdout.slice(-1000) : ''
    
    if (relevantStderr) {
      errorMessage += `\n\nSTDERR: ${relevantStderr}`
    }
    if (relevantStdout && !relevantStderr) {
      errorMessage += `\n\nSTDOUT: ${relevantStdout}`
    }
    
    throw new Error(`${language} compilation failed: ${errorMessage}`)
  }
}
