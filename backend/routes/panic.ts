/**
 * Panic Alert Routes
 * Emergency panic alert endpoints
 */

import express, { Request, Response, NextFunction } from 'express';
const router = express.Router();

import panicController from '../controllers/panicController';
import authMiddleware from '../middleware/auth';
import limiter from '../middleware/rateLimit';

/**
 * All panic routes require authentication
 */
router.use(authMiddleware);

/**
 * POST /api/panic-alert
 * Send a panic alert
 * Rate limit: 10 attempts per minute (safety critical - user can spam in emergency)
 */
router.post('/', limiter.limit(10, 60 * 1000), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await panicController.sendPanicAlert(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/panic-alert/history
 * Get panic alert history
 * Protected: User can only see their own alerts
 */
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await panicController.getPanicHistory(req, res, next);
  } catch (error) {
    next(error);
  }
});

export default router;
