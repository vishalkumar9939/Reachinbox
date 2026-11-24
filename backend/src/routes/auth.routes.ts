import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/google/url', AuthController.getGoogleAuthUrl);
router.get('/google/callback', AuthController.handleGoogleCallback);
router.post('/google/callback', AuthController.handleGoogleCallback);
router.post('/dev-login', AuthController.devLogin);
router.get('/me', requireAuth, AuthController.getProfile);

export default router;
