import pino from 'pino'
import { config } from '../config/index.js'

const isDev = config.nodeEnv === 'development'

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport:
    isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
  base: {
    env: config.nodeEnv,
  },
})
