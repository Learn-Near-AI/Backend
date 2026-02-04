import { Router } from 'express'
import { compileLimiter, deployLimiter, generalLimiter } from '../middleware/rateLimiter.js'
import {
  validateCompile,
  validateDeploy,
  validateContractCall,
  validateContractView,
} from '../middleware/validate.js'
import * as healthController from '../controllers/healthController.js'
import * as compileController from '../controllers/compileController.js'
import * as deployController from '../controllers/deployController.js'

const router = Router()

// Health & status (no rate limit on health)
router.get('/health', healthController.getHealth)
router.get('/near/status', generalLimiter, healthController.getNearStatus)

// Compile - Rust only, stricter rate limit
router.post('/compile', compileLimiter, validateCompile, compileController.compileContract)

// Deploy - stricter rate limit
router.post('/deploy', deployLimiter, validateDeploy, deployController.deploy)

// Contract interaction
router.post('/contract/call', generalLimiter, validateContractCall, deployController.callContractMethod)
router.post('/contract/view', generalLimiter, validateContractView, deployController.viewContractMethod)

export default router
