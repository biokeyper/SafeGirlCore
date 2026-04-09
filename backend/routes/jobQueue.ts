/**
 * Job Queue Monitoring Routes
 * Provides health monitoring for BullMQ job queues
 * Protected routes - requires authentication
 */

import { Router, Request, Response } from 'express';
import bullMqService from '../services/bullMqService';
import authMiddleware from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

/**
 * Health endpoint for job queues
 * Returns status of all queues
 * GET /api/jobs/health
 */
router.get('/health', authMiddleware, async (req: Request, res: Response) => {
  try {
    logger.info('JOBS', 'Job queue health check requested');

    const stats = await bullMqService.getQueueStats();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      queues: stats,
    });
  } catch (error) {
    logger.error('JOBS', 'Job queue health check failed', {
      error: (error as Error).message,
    });

    res.status(503).json({
      status: 'unhealthy',
      error: (error as Error).message,
    });
  }
});

export default router;
