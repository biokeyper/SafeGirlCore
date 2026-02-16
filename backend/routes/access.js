/**
 * Access Routes
 * Report sharing: grant/revoke access, view shared reports
 */

const express = require('express');
const router = express.Router();

const accessController = require('../controllers/accessController');
const authMiddleware = require('../middleware/auth');

/**
 * All access routes require authentication
 */
router.use(authMiddleware);

/**
 * POST /api/access/grant
 * Grant access to a report to another user
 * Protected: User must be authenticated
 */
router.post('/grant', async (req, res, next) => {
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
router.post('/revoke', async (req, res, next) => {
  try {
    await accessController.revokeAccess(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/access/shared-with-me
 * Get all reports shared with the authenticated user
 * Protected: User must be authenticated
 */
router.get('/shared-with-me', async (req, res, next) => {
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
router.get('/my-report/:reportId/viewers', async (req, res, next) => {
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
router.get('/report/:reportId', async (req, res, next) => {
  try {
    await accessController.viewReport(req, res, next);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
