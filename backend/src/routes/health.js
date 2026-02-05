import { Router } from 'express';
import { config } from '../config/index.js';

const router = Router();

router.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: config.version,
    environment: config.env,
  });
});

router.get('/api/health/live', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/api/health/ready', (req, res) => {
  res.json({ status: 'ok' });
});

export default router;
