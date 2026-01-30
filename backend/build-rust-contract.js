import { writeFile, mkdir, readFile, rm, readdir, copyFile } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'

const execAsync = promisify(exec)

// Shared Cargo target directory so dependency artifacts are reused across builds.
// Only one Rust build runs at a time (see buildLock below).
const sharedTargetDir = join(process.cwd(), 'temp-builds', 'cargo-target-shared')

// Serialize Rust compiles: one build at a time so shared target is not corrupted.
let buildLock = Promise.resolve()

/**
 * Pre-warm the shared Cargo target by building base-project once at startup.
 * Populates sharedTargetDir with dependency artifacts so the first user compile
 * only rebuilds the contract crate. Call before or when the server starts.
 * @returns {Promise<void>} Resolves when warmup completes; rejects on failure.
 */
export async function warmupSharedTarget() {
  const baseProjectPath = join(process.cwd(), 'base-project')
  await ensureBaseProject(baseProjectPath)
  await mkdir(sharedTargetDir, { recursive: true })

  console.log('Pre-warming shared Cargo target (building base-project)...')
  const startTime = Date.now()

  try {
    await execAsync('cargo near build non-reproducible-wasm', {
      cwd: baseProjectPath,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 900000,
      env: {
        ...process.env,
        CARGO_TARGET_DIR: sharedTargetDir,
      },
    })
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`✓ Pre-warm complete in ${elapsed}s; shared target ready.`)
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.warn(`Pre-warm failed after ${elapsed}s (first compile may be slow):`, err.message)
    throw err
  }
}

/**
 * Recursively copy directory
 */
async function copyDir(src, dst) {
  await mkdir(dst, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const dstPath = join(dst, entry.name)
    
    // Skip target and .git directories
    if (entry.name === 'target' || entry.name === '.git') {
      continue
    }
    
    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath)
    } else {
      await copyFile(srcPath, dstPath)
    }
  }
}

/**
 * Initialize base project template if it doesn't exist
 */
async function ensureBaseProject(baseProjectPath) {
  if (!existsSync(baseProjectPath)) {
    console.log('Creating base project template...')
    
    // Create base project structure
    await mkdir(join(baseProjectPath, 'src'), { recursive: true })
    
    // Create Cargo.toml
    const cargoToml = `[package]
name = "contract"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
near-sdk = "5"
borsh = "1"

[profile.release]
opt-level = "z"
lto = "thin"
codegen-units = 1
panic = "abort"
`
    await writeFile(join(baseProjectPath, 'Cargo.toml'), cargoToml, 'utf-8')

    // Pin Rust to 1.86 so WASM is compatible with nearcore VM (1.87+ is not)
    await writeFile(join(baseProjectPath, 'rust-toolchain.toml'), '[toolchain]\nchannel = "1.86.0"\n', 'utf-8')

    // Create default lib.rs with new syntax
    const defaultLibRs = `use near_sdk::near;
use near_sdk::PanicOnDefault;

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {}
    }
    
    pub fn hello_world(&self) -> String {
        "Hello, NEAR!".to_string()
    }
}
`
    await writeFile(join(baseProjectPath, 'src', 'lib.rs'), defaultLibRs, 'utf-8')
  }
}

/**
 * Converts old near_bindgen syntax to new near syntax for near-sdk 5
 */
function convertToNewSyntax(sourceCode) {
  // Check if already using new syntax
  if (sourceCode.includes('#[near(contract_state)]') || 
      (sourceCode.includes('use near_sdk::near;') && !sourceCode.includes('near_bindgen'))) {
    return sourceCode
  }
  
  let converted = sourceCode
  
  // Replace near_bindgen imports with near (handle with or without semicolon)
  converted = converted.replace(/use near_sdk::near_bindgen;?/g, 'use near_sdk::near;')
  
  // Handle use near_sdk::{near_bindgen, ...}
  converted = converted.replace(/use near_sdk::\{near_bindgen([^}]*)\};?/g, (match, rest) => {
    // Remove near_bindgen from the list and add near
    const items = rest.split(',').map(s => s.trim()).filter(s => s && s !== 'near_bindgen')
    if (items.length > 0) {
      return `use near_sdk::{near, ${items.join(', ')}};`
    }
    return 'use near_sdk::near;'
  })
  
  // Add PanicOnDefault import if not present
  if (!converted.includes('use near_sdk::PanicOnDefault') && !converted.includes('PanicOnDefault')) {
    // Find the last use statement and add after it
    const useStatements = converted.match(/use near_sdk::[^;]+;/g)
    if (useStatements && useStatements.length > 0) {
      const lastUse = useStatements[useStatements.length - 1]
      converted = converted.replace(lastUse, `${lastUse}\nuse near_sdk::PanicOnDefault;`)
    } else {
      converted = 'use near_sdk::PanicOnDefault;\n' + converted
    }
  }
  
  // Handle struct with #[near_bindgen] - convert to #[near(contract_state)]
  // Pattern: #[near_bindgen] followed by #[derive(...)] and pub struct
  converted = converted.replace(/#\[near_bindgen\]\s*\n?\s*#\[derive\(([^)]+)\)\]\s*\n?\s*pub struct/g, (match, derives) => {
    // Remove Default, BorshSerialize, and BorshDeserialize from derives
    // #[near(contract_state)] automatically provides BorshSerialize/BorshDeserialize
    const deriveList = derives.split(',').map(s => s.trim()).filter(s => 
      s && 
      s !== 'Default' && 
      s !== 'BorshSerialize' && 
      s !== 'BorshDeserialize'
    )
    // Add PanicOnDefault if not present
    if (!deriveList.includes('PanicOnDefault')) {
      deriveList.push('PanicOnDefault')
    }
    // Order: derive first, then #[near(contract_state)]
    return `#[derive(${deriveList.join(', ')})]\n#[near(contract_state)]\npub struct`
  })
  
  // Handle struct with just #[near_bindgen] (no derive)
  converted = converted.replace(/#\[near_bindgen\]\s*\n?\s*pub struct/g, 
    '#[derive(PanicOnDefault)]\n#[near(contract_state)]\npub struct')
  
  // Remove impl Default blocks (PanicOnDefault replaces Default)
  // Use a function to properly match balanced braces
  function removeImplDefault(code) {
    const pattern = /impl\s+Default\s+for\s+Contract\s*\{/g
    let match
    let result = code
    let offset = 0
    
    while ((match = pattern.exec(code)) !== null) {
      const start = match.index
      let braceCount = 1
      let i = match.index + match[0].length
      
      while (i < code.length && braceCount > 0) {
        if (code[i] === '{') braceCount++
        if (code[i] === '}') braceCount--
        i++
      }
      
      if (braceCount === 0) {
        // Remove the block including any trailing whitespace/newlines
        const end = i
        const before = result.substring(0, start - offset)
        const after = result.substring(end - offset)
        offset += (end - start)
        result = before + after
        // Reset regex lastIndex since we modified the string
        pattern.lastIndex = 0
        break // Remove one at a time
      }
    }
    
    return result
  }
  
  converted = removeImplDefault(converted)
  
  // Remove Default from any existing derive that has it (if not already handled)
  converted = converted.replace(/#\[derive\(([^)]*Default[^)]*)\)\]/g, (match, derives) => {
    const deriveList = derives.split(',').map(s => s.trim()).filter(s => s && s !== 'Default')
    if (!deriveList.includes('PanicOnDefault')) {
      deriveList.push('PanicOnDefault')
    }
    return `#[derive(${deriveList.join(', ')})]`
  })
  
  // Remove BorshSerialize and BorshDeserialize from derives when #[near(contract_state)] is present
  converted = converted.replace(/#\[derive\(([^)]+)\)\]\s*\n\s*#\[near\(contract_state\)\]/g, (match, derives) => {
    const deriveList = derives.split(',').map(s => s.trim()).filter(s => 
      s && 
      s !== 'BorshSerialize' && 
      s !== 'BorshDeserialize'
    )
    if (!deriveList.includes('PanicOnDefault')) {
      deriveList.push('PanicOnDefault')
    }
    return `#[derive(${deriveList.join(', ')})]\n#[near(contract_state)]`
  })
  
  // Clean up any double semicolons that might have been created
  converted = converted.replace(/;;+/g, ';')
  
  // Remove unused borsh imports if they're not needed
  // Check if BorshSerialize or BorshDeserialize are actually used in the code
  if (!converted.match(/BorshSerialize|BorshDeserialize/)) {
    converted = converted.replace(/use\s+near_sdk::borsh::\{[^}]*\};?\s*\n?/g, '')
  }
  
  // Ensure no duplicate PanicOnDefault
  converted = converted.replace(/#\[derive\(([^)]*PanicOnDefault[^)]*PanicOnDefault[^)]*)\)\]/g, (match) => {
    const derives = match.match(/#\[derive\(([^)]+)\)\]/)[1]
    const deriveList = [...new Set(derives.split(',').map(s => s.trim()))]
    return `#[derive(${deriveList.join(', ')})]`
  })
  
  // Replace #[near_bindgen] on impl blocks with #[near]
  converted = converted.replace(/#\[near_bindgen\]\s*\n?\s*impl/g, '#[near]\nimpl')
  
  // Remove impl Default blocks if they exist (PanicOnDefault replaces Default)
  // But keep them for now as they might be needed for initialization
  // converted = converted.replace(/impl Default for Contract[^}]*\{[^}]*\}/gs, '')
  
  return converted
}

/**
 * Builds a NEAR contract from Rust source code.
 * Uses a shared Cargo target dir so dependency artifacts are reused (faster subsequent builds).
 * Only one Rust build runs at a time (serialized via buildLock).
 *
 * @param {string} sourceCode - The Rust contract source code
 * @param {string} projectId - Optional project ID (ignored, kept for API compatibility)
 * @returns {Promise<Object>} Compilation result with stdout, stderr, wasm, and abi
 */
export async function buildRustContract(sourceCode, projectId = null) {
  const next = buildLock.catch(() => {}).then(() => runRustBuild(sourceCode))
  buildLock = next
  return next
}

async function runRustBuild(sourceCode) {
  const baseProjectPath = join(process.cwd(), 'base-project')

  const convertedCode = convertToNewSyntax(sourceCode)
  const tempDir = join(process.cwd(), 'temp-builds', randomBytes(8).toString('hex'))
  const projectDir = tempDir
  const startTime = Date.now()

  try {
    await ensureBaseProject(baseProjectPath)
    await mkdir(projectDir, { recursive: true })
    await mkdir(sharedTargetDir, { recursive: true })
    await copyDir(baseProjectPath, projectDir)

    const libRsPath = join(projectDir, 'src', 'lib.rs')
    await writeFile(libRsPath, convertedCode, 'utf-8')

    console.log(`Compiling Rust contract in: ${projectDir}`)
    console.log('⏳ First build: 5–15 min (deps). Later builds: much faster (shared target).')

    const compileResult = await execAsync('cargo near build non-reproducible-wasm', {
      cwd: projectDir,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 900000,
      env: {
        ...process.env,
        CARGO_TARGET_DIR: sharedTargetDir,
      },
    })

    if (compileResult.stdout) console.log('Build output:', compileResult.stdout)
    if (compileResult.stderr) console.log('Build warnings:', compileResult.stderr)

    const compilationTime = (Date.now() - startTime) / 1000

    // cargo-near writes to target/near/; with CARGO_TARGET_DIR that is sharedTargetDir/near/
    const nearOutDir = join(sharedTargetDir, 'near')
    const wasmPath = join(nearOutDir, 'contract.wasm')
    const abiPath = join(nearOutDir, 'contract.json')

    let wasmBuffer = null
    let wasmSize = 0
    let abi = null
    let originalSize = 0

    try {
      if (existsSync(abiPath)) {
        try {
          const abiContent = await readFile(abiPath, 'utf-8')
          abi = JSON.parse(abiContent)
          console.log(`✓ ABI file generated`)
        } catch (abiError) {
          console.warn('Could not parse ABI file:', abiError.message)
        }
      }

      if (existsSync(wasmPath)) {
        wasmBuffer = await readFile(wasmPath)
        originalSize = wasmBuffer.length
        wasmSize = originalSize
        console.log(`✓ WASM file compiled: ${originalSize} bytes`)

        try {
          const optimizedWasmPath = join(projectDir, 'contract_optimized.wasm')
          await execAsync(`wasm-opt -Oz -o "${optimizedWasmPath}" "${wasmPath}"`, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 60000,
          })

          if (existsSync(optimizedWasmPath)) {
            const optimizedBuffer = await readFile(optimizedWasmPath)
            const optimizedSize = optimizedBuffer.length
            const reduction = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1)
            console.log(`✓ WASM optimized: ${originalSize} → ${optimizedSize} bytes (${reduction}% reduction)`)
            wasmBuffer = optimizedBuffer
            wasmSize = optimizedSize
            await rm(optimizedWasmPath, { force: true }).catch(() => {})
          }
        } catch (wasmOptError) {
          console.warn('wasm-opt not available or failed (continuing with unoptimized WASM):', wasmOptError.message)
        }
      } else {
        try {
          if (existsSync(nearOutDir)) {
            const files = await readdir(nearOutDir)
            const wasmFile = files.find(f => f.endsWith('.wasm'))
            if (wasmFile) {
              wasmBuffer = await readFile(join(nearOutDir, wasmFile))
              wasmSize = wasmBuffer.length
              console.log(`✓ Found WASM file: ${wasmFile} (${wasmSize} bytes)`)
            }
          }
        } catch (dirError) {
          console.warn('Could not read cargo-near output directory:', dirError.message)
        }
      }
    } catch (error) {
      console.warn('Could not extract WASM file:', error.message)
    }

    if (!wasmBuffer) {
      throw new Error('WASM file was not generated. Compilation may have failed.')
    }

    await rm(projectDir, { recursive: true, force: true }).catch(() => {
      console.warn('Warning: Could not clean up temporary build directory')
    })

    return {
      success: true,
      exit_code: 0,
      stdout: compileResult.stdout,
      stderr: compileResult.stderr,
      wasm: wasmBuffer.toString('base64'),
      wasmSize,
      abi,
      compilation_time: compilationTime,
      project_path: null,
      cached: false,
    }
  } catch (error) {
    await rm(projectDir, { recursive: true, force: true }).catch(() => {})

    const exitCode = error.code || -1
    const stdout = error.stdout || ''
    const stderr = error.stderr || error.message || ''

    throw {
      success: false,
      exit_code: exitCode,
      stdout,
      stderr,
      wasm: null,
      wasmSize: 0,
      abi: null,
      compilation_time: (Date.now() - startTime) / 1000,
      error: error.message,
    }
  }
}

