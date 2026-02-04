import 'dotenv/config'
import app from './index.js'
import { config } from './config/index.js'
import { logger } from './utils/logger.js'
import { warmupRustTarget } from './services/compileService.js'

async function startServer() {
  const { port, host } = config

  app.listen(port, host, () => {
    logger.info(
      {
        port,
        host,
        env: config.nodeEnv,
      },
      'Backend server started'
    )
    logger.info(`  Health:     GET  http://${host}:${port}/api/health`)
    logger.info(`  NEAR:       GET  http://${host}:${port}/api/near/status`)
    logger.info(`  Compile:    POST http://${host}:${port}/api/compile`)
    logger.info(`  Deploy:     POST http://${host}:${port}/api/deploy`)
    logger.info(`  Call:       POST http://${host}:${port}/api/contract/call`)
    logger.info(`  View:       POST http://${host}:${port}/api/contract/view`)
    if (config.nearAccountId) {
      logger.info(`  NEAR account: ${config.nearAccountId} on ${config.nearNetwork}`)
    }
  })

  warmupRustTarget().catch((err) => {
    logger.warn({ err: err.message }, 'Rust warmup skipped or failed')
  })
}

startServer().catch((err) => {
  logger.fatal({ err }, 'Failed to start server')
  process.exit(1)
})
