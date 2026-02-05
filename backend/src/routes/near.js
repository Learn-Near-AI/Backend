import { Router } from 'express';
import * as deployService from '../services/deploy.js';

const router = Router();

router.get('/api/near/status', (req, res) => {
  const result = deployService.getNearStatus();
  res.json(result);
});

export default router;
