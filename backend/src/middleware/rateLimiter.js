/**
 * Rate limiting - protect compile/deploy endpoints
 * Uses in-memory store (for multi-instance use Redis)
 */
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

export const generalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  message: { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const compileLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitCompileMax,
  message: { error: 'Too many compile requests', code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const deployLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitDeployMax,
  message: { error: 'Too many deploy requests', code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false,
});
