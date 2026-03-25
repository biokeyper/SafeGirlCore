/**
 * Access Routes
 * Report sharing: grant/revoke access, view shared reports
 */

import express, { Request, Response, NextFunction } from 'express';
const router = express.Router();

import accessController from '../controllers/accessController';
import authMiddleware from '../middleware/auth';

/**
 * All access routes require authentication
 */
router.use(authMiddleware);

/**
 * POST /api/access/grant
 * Grant access to a report to another user
 * Protected: User must be authenticated
 */
router.post('/grant', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await accessController.grantAccess(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/access/revoke
 * Revoke access to a report from a user
 * Protected: User must be authenticated and own the report
 */
router.post('/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await accessController.revokeAccess(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/access/my-shared-reports
 * Get all reports I've shared with others
 * Protected: User must be authenticated
 */
router.get('/my-shared-reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await accessController.getMySharedReports(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/access/shared-with-me
 * Get all reports shared with the authenticated user
 * Protected: User must be authenticated
 */
router.get('/shared-with-me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await accessController.getSharedReports(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/access/my-report/:reportId/viewers
 * Get all users who have access to my report
 * Protected: User must be authenticated and own the report
 */
router.get('/my-report/:reportId/viewers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await accessController.getReportViewers(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/access/report/:reportId
 * View a report if user has access (owned or granted)
 * Protected: User must be authenticated and have access
 */
router.get('/report/:reportId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await accessController.viewReport(req, res, next);
  } catch (error) {
    next(error);
  }
});

export default router;
