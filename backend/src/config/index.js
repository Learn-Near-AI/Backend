import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

/**
 * Central configuration - validates and exports env-based config
 */
function getEnv(key, defaultValue) {
  const value = process.env[key];
  return value !== undefined && value !== '' ? value : defaultValue;
}

function getEnvNumber(key, defaultValue) {
  const value = process.env[key];
  if (value === undefined || value === '') return defaultValue;
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? defaultValue : num;
}

export const config = {
  env: getEnv('NODE_ENV', 'development'),
  version: pkg.version || '1.0.0',
  port: getEnvNumber('PORT', 3001),
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',

  // CORS
  corsOrigin: getEnv('CORS_ORIGIN', '*'),

  // NEAR (optional - required for deploy/call/view)
  nearAccountId: process.env.NEAR_ACCOUNT_ID,
  nearPrivateKey: process.env.NEAR_PRIVATE_KEY,
  nearNetwork: getEnv('NEAR_NETWORK', 'testnet'),

  // Rate limiting
  rateLimitWindowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000),
  rateLimitMax: getEnvNumber('RATE_LIMIT_MAX', 100),
  rateLimitCompileMax: getEnvNumber('RATE_LIMIT_COMPILE_MAX', 20),
  rateLimitDeployMax: getEnvNumber('RATE_LIMIT_DEPLOY_MAX', 10),
};

export function validateConfig() {
  const warnings = [];
  if (!config.nearAccountId || !config.nearPrivateKey) {
    warnings.push('NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY not set - deploy/call/view endpoints will return 503');
  }
  return warnings;
}
