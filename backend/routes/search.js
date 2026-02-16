/**
 * Search Routes
 * Report search and filtering endpoints
 */

const express = require('express');
const router = express.Router();

const searchController = require('../controllers/searchController');
const authMiddleware = require('../middleware/auth');

/**
 * All search routes require authentication
 */
router.use(authMiddleware);

/**
 * GET /api/search/reports
 * Search and filter reports
 * Query: status, createdAfter, createdBefore, limit, offset
 */
router.get('/reports', async (req, res, next) => {
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
router.get('/stats', async (req, res, next) => {
  try {
    await searchController.getReportStats(req, res, next);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
