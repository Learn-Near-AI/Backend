import { Router } from 'express';
import { compileValidation, handleValidationErrors } from '../middleware/validation.js';
import { compileLimiter } from '../middleware/rateLimiter.js';
import * as compileService from '../services/compile.js';

const router = Router();

router.post(
  '/api/compile',
  compileLimiter,
  compileValidation,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { code, language } = req.body;
      const result = await compileService.compileContract(code, language);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
