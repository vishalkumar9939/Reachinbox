import { Router } from 'express';
import { EmailController } from '../controllers/email.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  validateBody,
  validateQuery,
  scheduleEmailSchema,
  batchScheduleSchema,
  searchEmailSchema,
} from '../middleware/validation.middleware.js';

const router = Router();

// Protect all email routes with JWT auth
router.use(requireAuth);

router.post('/schedule', validateBody(scheduleEmailSchema), EmailController.scheduleSingle);
router.post('/batch-schedule', validateBody(batchScheduleSchema), EmailController.scheduleBatch);
router.post('/parse-recipients', EmailController.parseRecipientText);
router.get('/', validateQuery(searchEmailSchema), EmailController.getEmails);
router.get('/dashboard-overview', EmailController.getDashboardOverview);
router.get('/:id', EmailController.getEmailById);
router.post('/:id/cancel', EmailController.cancelEmail);
router.post('/:id/retry', EmailController.retryEmail);

export default router;
