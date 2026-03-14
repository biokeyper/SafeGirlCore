/**
 * Search Controller
 * Handles report search and filtering
 */

const databaseService = require('../services/database');
const logger = require('../utils/logger');

class SearchController {

  /**
   * Search and filter reports
   * GET /api/reports/search
   *
   * Query params:
   * - status: pending, submitted, failed, archived
   * - createdAfter: ISO date string
   * - createdBefore: ISO date string
   * - limit: results per page (default 10, max 100)
   * - offset: pagination offset (default 0)
   */
  async searchReports(req, res, next) {
    try {
      const userId = req.user?.userId;
      const { status, createdAfter, createdBefore, limit = 10, offset = 0 } = req.query;

      logger.logRequest('GET', '/api/reports/search', {
        userId,
        status,
        createdAfter,
        createdBefore,
        limit,
        offset
      });

      if (!userId) {
        logger.warn('SEARCH', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Validate limit (max 100 results per page)
      const parsedLimit = Math.min(parseInt(limit) || 10, 100);
      const parsedOffset = Math.max(parseInt(offset) || 0, 0);

      // Build filter conditions
      const filters = {
        userId,
        limit: parsedLimit,
        offset: parsedOffset
      };

      if (status) {
        if (!['pending', 'submitted', 'failed', 'archived'].includes(status)) {
          logger.warn('SEARCH', 'Invalid status filter', { status });
          return res.status(400).json({
            error: true,
            message: 'Invalid status. Must be: pending, submitted, failed, or archived'
          });
        }
        filters.status = status;
      }

      if (createdAfter) {
        const afterDate = new Date(createdAfter);
        if (isNaN(afterDate.getTime())) {
          logger.warn('SEARCH', 'Invalid createdAfter date', { createdAfter });
          return res.status(400).json({
            error: true,
            message: 'Invalid createdAfter date format (use ISO 8601)'
          });
        }
        filters.createdAfter = afterDate;
      }

      if (createdBefore) {
        const beforeDate = new Date(createdBefore);
        if (isNaN(beforeDate.getTime())) {
          logger.warn('SEARCH', 'Invalid createdBefore date', { createdBefore });
          return res.status(400).json({
            error: true,
            message: 'Invalid createdBefore date format (use ISO 8601)'
          });
        }
        filters.createdBefore = beforeDate;
      }

      logger.info('SEARCH', 'Searching reports', { userId, filters });

      // Search reports
      const result = await databaseService.searchReports(filters);

      logger.success('SEARCH', 'Reports searched', {
        userId,
        found: result.reports.length,
        total: result.total
      });

      res.status(200).json({
        success: true,
        message: 'Reports searched successfully',
        data: {
          reports: result.reports.map(r => ({
            reportId: r.reportId,
            status: r.status,
            createdAt: r.createdAt,
            submittedAt: r.submittedAt,
            txHash: r.txHash,
            ipfsHash: r.ipfsHash
          })),
          pagination: {
            total: result.total,
            limit: parsedLimit,
            offset: parsedOffset,
            hasMore: result.total > (parsedOffset + parsedLimit)
          }
        }
      });

    } catch (error) {
      logger.error('SEARCH', 'Search failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to search reports',
        code: 'SEARCH_FAILED'
      });
    }
  }

  /**
   * Get report statistics for user
   * GET /api/reports/stats
   * Protected: User must be authenticated
   */
  async getReportStats(req, res, next) {
    try {
      const userId = req.user?.userId;

      logger.logRequest('GET', '/api/reports/stats', { userId });

      if (!userId) {
        logger.warn('SEARCH', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      const stats = await databaseService.getReportStats(userId);

      logger.success('SEARCH', 'Stats retrieved', {
        userId,
        stats
      });

      res.status(200).json({
        success: true,
        message: 'Report statistics retrieved',
        data: {
          totalReports: stats.total || 0,
          pending: stats.pending || 0,
          submitted: stats.submitted || 0,
          failed: stats.failed || 0,
          archived: stats.archived || 0,
          sharedWithMe: stats.sharedWithMe || 0
        }
      });

    } catch (error) {
      logger.error('SEARCH', 'Get stats failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to get report statistics',
        code: 'STATS_FAILED'
      });
    }
  }
}

module.exports = new SearchController();
