import { Router } from 'express';
import { QueueController } from '../controllers/queue.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);

router.get('/stats', QueueController.getStatistics);
router.post('/pause', QueueController.pauseQueue);
router.post('/resume', QueueController.resumeQueue);
router.post('/clean-failed', QueueController.cleanFailed);

export default router;
