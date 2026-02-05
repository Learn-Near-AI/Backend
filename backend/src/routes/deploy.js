import { Router } from 'express';
import { deployValidation, handleValidationErrors } from '../middleware/validation.js';
import { deployLimiter } from '../middleware/rateLimiter.js';
import * as deployService from '../services/deploy.js';

const router = Router();

router.post(
  '/api/deploy',
  deployLimiter,
  deployValidation,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { wasmBase64, contractAccountId, initMethod, initArgs } = req.body;
      const result = await deployService.deployWasm(wasmBase64, {
        contractAccountId,
        initMethod,
        initArgs,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
