import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config/index.js'
import { requestLogger } from './middleware/requestLogger.js'
import { errorHandler } from './middleware/errorHandler.js'
import routes from './routes/index.js'

const app = express()

// Security headers. CSP disabled: this is an API server, not serving HTML.
app.use(helmet({ contentSecurityPolicy: false }))

// CORS
const corsOptions = {
  origin:
    config.corsOrigins === '*'
      ? '*'
      : config.corsOrigins.split(',').map((o) => o.trim()),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  credentials: config.corsOrigins !== '*',
}
app.use(cors(corsOptions))

// Body parsing
app.use(express.json({ limit: config.maxJsonBodySize }))

// Request logging & ID
app.use(requestLogger)

// API routes - mount at /api for backward compatibility
app.use('/api', routes)

// 404 handler
app.use((req, res, next) => {
  const requestId = req.id || req.headers['x-request-id'] || 'unknown'
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    requestId,
  })
})

// Central error handler (must be last)
app.use(errorHandler)

export default app
