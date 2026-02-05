import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getCorsConfig } from './config/cors.js';
import { mountRoutes } from './routes/index.js';
import { requestLogger } from './middleware/requestLogger.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(getCorsConfig()));
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);
app.use(generalLimiter);

mountRoutes(app);

app.use((req, res, next) => {
  next({ statusCode: 404, message: `Not found: ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' });
});

app.use(errorHandler);

export default app;
