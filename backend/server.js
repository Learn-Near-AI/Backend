import 'dotenv/config';
import app from './src/app.js';
import { initializeTemplate } from './build-contract-optimized.js';
import { areCredentialsConfigured } from './deploy-contract.js';
import { config, validateConfig } from './src/config/index.js';
import { logger } from './src/utils/logger.js';

app.listen(config.port, '0.0.0.0', async () => {
  logger.info(`Backend server running on http://localhost:${config.port}`);
  logger.info(`Compile: POST /api/compile | Deploy: POST /api/deploy`);
  logger.info(`Call: POST /api/contract/call | View: POST /api/contract/view`);
  logger.info(`Health: GET /api/health | NEAR Status: GET /api/near/status`);

  const warnings = validateConfig();
  warnings.forEach((w) => logger.warn(w));

  try {
    logger.info('Initializing contract template (this happens once)...');
    await initializeTemplate();
    logger.info('Contract template initialized successfully');
  } catch (error) {
    if (
      error.message?.includes('Windows') ||
      error.message?.includes('not supported')
    ) {
      logger.warn('JavaScript/TypeScript compilation not available on Windows');
      logger.warn(error.message);
      logger.warn('Server will run, but JS/TS compilation will fail gracefully.');
    } else {
      logger.warn(`Template initialization failed: ${error.message}`);
      logger.warn('JavaScript/TypeScript compilation may be slower on first build');
    }
  }

  if (areCredentialsConfigured()) {
    logger.info(
      `NEAR CLI configured for ${process.env.NEAR_ACCOUNT_ID} on ${process.env.NEAR_NETWORK || 'testnet'}`
    );
  } else {
    logger.warn('NEAR CLI not configured. Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY to enable deployment.');
  }
});
