import { Router } from 'express'
import * as deployJsController from '../controllers/deployJsController.js'

const router = Router()

router.get('/js/near/status', deployJsController.getJsNearStatus)

router.post('/js/compile', deployJsController.compileJs)

router.post('/js/deploy', deployJsController.deployJs)

router.post('/js/contract/call', deployJsController.callJsContractMethod)

router.post('/js/contract/view', deployJsController.viewJsContractMethod)

export default router
