/**
 * Structured logger - JSON in production, pretty in development
 */
import { config } from '../config/index.js';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? 1;

function formatMessage(level, message, meta = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };
  return config.isProduction ? JSON.stringify(entry) : `${entry.time} [${level}] ${message}${Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''}`;
}

export const logger = {
  debug(msg, meta) {
    if (currentLevel <= LOG_LEVELS.debug) {
      console.log(formatMessage('debug', msg, meta));
    }
  },
  info(msg, meta) {
    if (currentLevel <= LOG_LEVELS.info) {
      console.log(formatMessage('info', msg, meta));
    }
  },
  warn(msg, meta) {
    if (currentLevel <= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', msg, meta));
    }
  },
  error(msg, meta) {
    if (currentLevel <= LOG_LEVELS.error) {
      console.error(formatMessage('error', msg, meta));
    }
  },
};
