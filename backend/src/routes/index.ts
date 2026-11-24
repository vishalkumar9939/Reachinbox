import { Router } from 'express';
import authRoutes from './auth.routes.js';
import emailRoutes from './email.routes.js';
import queueRoutes from './queue.routes.js';
import slackRoutes from './slack.routes.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/emails', emailRoutes);
apiRouter.use('/queues', queueRoutes);
apiRouter.use('/slack', slackRoutes);

apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'reachinbox-scheduler-api',
  });
});

export default apiRouter;
