import { Router } from 'express';
import { SlackController } from '../controllers/slack.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Public OAuth callback from Slack
router.get('/callback', SlackController.handleCallback);

// Protected routes
router.get('/auth-url', requireAuth, SlackController.getAuthUrl);
router.get('/status', requireAuth, SlackController.getStatus);
router.post('/disconnect', requireAuth, SlackController.disconnect);
router.post('/test', requireAuth, SlackController.sendTestNotification);

export default router;
