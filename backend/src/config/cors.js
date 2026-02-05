/**
 * CORS configuration - configurable via environment variables
 */
import { config } from './index.js';

export function getCorsConfig() {
  const origin = config.corsOrigin;

  if (origin) {
    if (origin === '*') {
      return {
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false,
      };
    }
    return {
      origin: origin.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    };
  }

  if (config.isProduction) {
    return {
      origin: false,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
    };
  }

  return {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  };
}
