import healthRouter from './health.js';
import compileRouter from './compile.js';
import deployRouter from './deploy.js';
import contractRouter from './contract.js';
import nearRouter from './near.js';

export function mountRoutes(app) {
  app.use(healthRouter);
  app.use(compileRouter);
  app.use(deployRouter);
  app.use(contractRouter);
  app.use(nearRouter);
}
