/**
 * Search Routes
 * Report search and filtering endpoints
 */

import express, { Request, Response, NextFunction } from 'express';
const router = express.Router();

import searchController from '../controllers/searchController';
import authMiddleware from '../middleware/auth';

/**
 * All search routes require authentication
 */
router.use(authMiddleware);

/**
 * GET /api/search/reports
 * Search and filter reports
 * Query: status, createdAfter, createdBefore, limit, offset
 */
router.get('/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await searchController.searchReports(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/search/stats
 * Get report statistics for user
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await searchController.getReportStats(req, res, next);
  } catch (error) {
    next(error);
  }
});

export default router;
