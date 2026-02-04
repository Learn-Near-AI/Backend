/**
 * Application configuration loaded from environment variables.
 * Never commit secrets - use .env for local development.
 */
const requiredEnvVars = ['NEAR_ACCOUNT_ID', 'NEAR_PRIVATE_KEY', 'NEAR_NETWORK']

function loadConfig() {
  const config = {
    // Server
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    host: process.env.HOST || '0.0.0.0',

    // NEAR blockchain
    nearAccountId: process.env.NEAR_ACCOUNT_ID || '',
    nearPrivateKey: process.env.NEAR_PRIVATE_KEY || '',
    nearNetwork: process.env.NEAR_NETWORK || 'testnet',
    nearNodeUrl:
      process.env.NEAR_NODE_URL ||
      (process.env.NEAR_NETWORK === 'mainnet'
        ? 'https://rpc.mainnet.near.org'
        : 'https://rpc.testnet.fastnear.com'),
    nearExplorerBaseUrl:
      process.env.NEAR_EXPLORER_URL ||
      (process.env.NEAR_NETWORK === 'mainnet'
        ? 'https://explorer.mainnet.near.org'
        : 'https://explorer.testnet.near.org'),

    // CORS - comma-separated origins, or '*' for all
    corsOrigins: process.env.CORS_ORIGINS || '*',

    // Rate limiting
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '30', 10), // 30 requests per window
    rateLimitCompileMax: parseInt(process.env.RATE_LIMIT_COMPILE_MAX || '5', 10),
    rateLimitDeployMax: parseInt(process.env.RATE_LIMIT_DEPLOY_MAX || '10', 10),

    // Request limits
    maxJsonBodySize: process.env.MAX_JSON_BODY_SIZE || '10mb',
    maxCodeLength: parseInt(process.env.MAX_CODE_LENGTH || '500000', 10), // ~500KB
    maxWasmBase64Length: parseInt(process.env.MAX_WASM_BASE64_LENGTH || '6000000', 10), // ~4.5MB base64 for ~3.3MB WASM
  }

  const missing = requiredEnvVars.filter((key) => {
    const val = process.env[key]
    return !val || (typeof val === 'string' && val.trim() === '')
  })

  if (missing.length > 0 && config.nodeEnv === 'production') {
    // Bootstrap phase: logger may not be ready yet; use console for critical startup warnings
    console.warn(
      `[config] Missing required env vars in production: ${missing.join(', ')}. ` +
        'NEAR operations will fail until configured.'
    )
  }

  return config
}

export const config = loadConfig()
