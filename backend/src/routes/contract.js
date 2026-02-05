import { Router } from 'express';
import {
  contractCallValidation,
  contractViewValidation,
  handleValidationErrors,
} from '../middleware/validation.js';
import * as deployService from '../services/deploy.js';

const router = Router();

router.post(
  '/api/contract/call',
  contractCallValidation,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { contractAccountId, methodName, args, accountId, deposit, gas } = req.body;
      const result = await deployService.callContractMethod(
        contractAccountId,
        methodName,
        args || {},
        { accountId, deposit, gas }
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/api/contract/view',
  contractViewValidation,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { contractAccountId, methodName, args } = req.body;
      const result = await deployService.viewContractMethod(
        contractAccountId,
        methodName,
        args || {}
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
