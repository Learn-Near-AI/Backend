import rateLimit from 'express-rate-limit'
import { config } from '../config/index.js'

/**
 * General API rate limiter
 */
export const generalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Stricter limiter for compile endpoint (CPU-intensive)
 */
export const compileLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitCompileMax,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Compile rate limit exceeded. Please try again later.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Stricter limiter for deploy endpoint (costs NEAR)
 */
export const deployLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitDeployMax,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Deploy rate limit exceeded. Please try again later.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
})
