/**
 * Access Controller
 * Handles report sharing: grant/revoke access, view shared reports
 */

const blockchainService = require('../services/blockchain');
const databaseService = require('../services/database');
const logger = require('../utils/logger');

class AccessController {

  /**
   * Grant access to a specific report to another user
   * POST /api/access/grant
   *
   * Body:
   * {
   *   reportId: "report_...",
   *   grantToUserId: "user_...",
   *   expiresIn: 2592000  // Optional: seconds (default 30 days)
   * }
   */
  async grantAccess(req, res, next) {
    try {
      const { reportId, grantToUserId, expiresIn } = req.body;
      const reporterUserId = req.user?.userId; // From JWT auth middleware

      logger.logRequest('POST', '/api/access/grant', { reportId, grantToUserId });

      // Validate inputs
      if (!reportId || !grantToUserId) {
        logger.warn('ACCESS', 'Missing required fields', { reportId: !!reportId, grantToUserId: !!grantToUserId });
        return res.status(400).json({
          error: true,
          message: 'reportId and grantToUserId are required'
        });
      }

      if (!reporterUserId) {
        logger.warn('ACCESS', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Check if trying to grant access to self
      if (grantToUserId === reporterUserId) {
        logger.warn('ACCESS', 'Cannot grant access to self', { reportId, userId: reporterUserId });
        return res.status(400).json({
          error: true,
          message: 'Cannot grant access to yourself - you already own this report'
        });
      }

      // Check if reporter owns the report
      const submission = await databaseService.getSubmission(reportId, reporterUserId);
      if (!submission) {
        logger.warn('ACCESS', 'Report not found or not owned by user', { reportId, reporterUserId });
        return res.status(404).json({
          error: true,
          message: 'Report not found or you do not own this report'
        });
      }

      // Check if target user exists
      const targetUser = await databaseService.getUser(grantToUserId);
      if (!targetUser) {
        logger.warn('ACCESS', 'Target user does not exist', { grantToUserId });
        return res.status(404).json({
          error: true,
          message: 'User does not exist'
        });
      }

      // Calculate expiry time
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

      logger.info('ACCESS', 'Granting access to user', { reportId, grantToUserId });

      // Save to database only
      // Note: Access control is handled in database, not blockchain
      // Blockchain records the report; database controls who can view it
      const access = await databaseService.grantAccess({
        reportId,
        reporterId: reporterUserId,
        viewerId: grantToUserId,
        expiresAt,
        txHash: null  // No blockchain transaction for access control
      });

      logger.success('ACCESS', 'Access saved to database', {
        reportId,
        grantToUserId,
        accessId: access.id
      });

      res.status(200).json({
        success: true,
        message: 'Access granted successfully',
        data: {
          accessId: access.id,
          reportId,
          grantedTo: grantToUserId,
          expiresAt: expiresAt.toISOString()
        }
      });

    } catch (error) {
      logger.error('ACCESS', 'Grant access failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to grant access',
        code: 'GRANT_ACCESS_FAILED'
      });
    }
  }

  /**
   * Revoke access to a report from a user
   * POST /api/access/revoke
   *
   * Body:
   * {
   *   reportId: "report_...",
   *   revokeFromUserId: "user_..."
   * }
   */
  async revokeAccess(req, res, next) {
    try {
      const { reportId, revokeFromUserId } = req.body;
      const reporterUserId = req.user?.userId;

      logger.logRequest('POST', '/api/access/revoke', { reportId, revokeFromUserId });

      if (!reportId || !revokeFromUserId) {
        logger.warn('ACCESS', 'Missing required fields', { reportId: !!reportId, revokeFromUserId: !!revokeFromUserId });
        return res.status(400).json({
          error: true,
          message: 'reportId and revokeFromUserId are required'
        });
      }

      if (!reporterUserId) {
        logger.warn('ACCESS', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Check if reporter owns the report
      const submission = await databaseService.getSubmission(reportId, reporterUserId);
      if (!submission) {
        logger.warn('ACCESS', 'Report not found or not owned by user', { reportId, reporterUserId });
        return res.status(404).json({
          error: true,
          message: 'Report not found or you do not own this report'
        });
      }

      // Check if target user exists
      const targetUser = await databaseService.getUser(revokeFromUserId);
      if (!targetUser) {
        logger.warn('ACCESS', 'Target user does not exist', { revokeFromUserId });
        return res.status(404).json({
          error: true,
          message: 'User does not exist'
        });
      }

      logger.info('ACCESS', 'Revoking access from database', { reportId, revokeFromUserId });

      // Revoke access in database only
      // Note: Access control is handled in database, not blockchain
      const access = await databaseService.revokeAccess(reportId, revokeFromUserId);

      logger.success('ACCESS', 'Access revoked in database', {
        reportId,
        revokeFromUserId
      });

      res.status(200).json({
        success: true,
        message: 'Access revoked successfully',
        data: {
          reportId,
          revokedFrom: revokeFromUserId
        }
      });

    } catch (error) {
      logger.error('ACCESS', 'Revoke access failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to revoke access',
        code: 'REVOKE_ACCESS_FAILED'
      });
    }
  }

  /**
   * Get all reports I've shared with others
   * GET /api/access/my-shared-reports
   */
  async getMySharedReports(req, res, next) {
    try {
      const reporterUserId = req.user?.userId;

      logger.logRequest('GET', '/api/access/my-shared-reports', {});

      if (!reporterUserId) {
        logger.warn('ACCESS', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Get all reports owned by user with access info
      const mySharedReports = await databaseService.getMySharedReports(reporterUserId);

      // Fetch full submission data for each shared report
      const reportsWithContent = [];
      for (const report of mySharedReports) {
        const submission = await databaseService.getSubmission(report.reportId, reporterUserId);
        if (submission) {
          reportsWithContent.push({
            reportId: report.reportId,
            createdAt: report.createdAt,
            status: report.status,
            viewerCount: report.viewerCount,
            responses: submission.responses,
            metadata: submission.metadata,
            viewers: report.viewers.map(viewer => ({
              viewerId: viewer.viewerid || viewer.viewerId,
              phone: viewer.phone,
              email: viewer.email,
              grantedAt: viewer.grantedat || viewer.grantedAt,
              expiresAt: viewer.expiresat || viewer.expiresAt,
              isActive: viewer.isactive || viewer.isActive
            }))
          });
        }
      }

      logger.success('ACCESS', 'Retrieved user\'s shared reports', {
        reporterId: reporterUserId,
        reportCount: reportsWithContent.length
      });

      res.status(200).json({
        success: true,
        message: 'My shared reports retrieved',
        data: {
          reports: reportsWithContent
        }
      });

    } catch (error) {
      logger.error('ACCESS', 'Get my shared reports failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to retrieve my shared reports',
        code: 'GET_MY_SHARED_FAILED'
      });
    }
  }

  /**
   * Get all reports shared with the authenticated user
   * GET /api/access/shared-with-me
   */
  async getSharedReports(req, res, next) {
    try {
      const viewerUserId = req.user?.userId;

      logger.logRequest('GET', '/api/access/shared-with-me', {});

      if (!viewerUserId) {
        logger.warn('ACCESS', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Get all active access grants for this user
      const sharedReports = await databaseService.getSharedReports(viewerUserId);

      // Fetch full submission data for each shared report
      const reportsWithContent = [];
      for (const access of sharedReports) {
        const submission = await databaseService.getSubmission(access.reportid, viewerUserId);
        if (submission) {
          reportsWithContent.push({
            reportId: access.reportid || access.reportId,
            reporterId: access.reporterid || access.reporterId,
            reporterPhone: access.phone,
            reporterEmail: access.email,
            grantedAt: access.grantedat || access.grantedAt,
            expiresAt: access.expiresat || access.expiresAt,
            isActive: access.isactive || access.isActive,
            status: submission.status,
            createdAt: submission.createdat,
            responses: submission.responses,
            metadata: submission.metadata
          });
        }
      }

      logger.success('ACCESS', 'Retrieved shared reports', {
        viewerId: viewerUserId,
        reportCount: reportsWithContent.length
      });

      res.status(200).json({
        success: true,
        message: 'Shared reports retrieved',
        data: {
          reports: reportsWithContent
        }
      });

    } catch (error) {
      logger.error('ACCESS', 'Get shared reports failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to retrieve shared reports',
        code: 'GET_SHARED_FAILED'
      });
    }
  }

  /**
   * Get all users who have access to my report
   * GET /api/access/my-report/:reportId/viewers
   */
  async getReportViewers(req, res, next) {
    try {
      const { reportId } = req.params;
      const reporterUserId = req.user?.userId;

      logger.logRequest('GET', `/api/access/my-report/${reportId}/viewers`, {});

      if (!reporterUserId) {
        logger.warn('ACCESS', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Verify ownership of report
      const submission = await databaseService.getSubmission(reportId, reporterUserId);
      if (!submission) {
        logger.warn('ACCESS', 'Report not found or not owned by user', { reportId, reporterUserId });
        return res.status(404).json({
          error: true,
          message: 'Report not found or you do not own this report'
        });
      }

      // Get all viewers with access to this report
      const viewers = await databaseService.getReportViewers(reportId, reporterUserId);

      logger.success('ACCESS', 'Retrieved report viewers', {
        reportId,
        viewerCount: viewers.length
      });

      res.status(200).json({
        success: true,
        message: 'Report viewers retrieved',
        data: {
          reportId,
          viewers: viewers.map(access => ({
            viewerId: access.viewerid || access.viewerId,
            phone: access.phone,
            email: access.email,
            grantedAt: access.grantedat || access.grantedAt,
            expiresAt: access.expiresat || access.expiresAt,
            isActive: access.isactive || access.isActive
          }))
        }
      });

    } catch (error) {
      logger.error('ACCESS', 'Get report viewers failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to retrieve viewers',
        code: 'GET_VIEWERS_FAILED'
      });
    }
  }

  /**
   * View a report if user has access (decrypt if backend encryption is used)
   * GET /api/access/report/:reportId
   */
  async viewReport(req, res, next) {
    try {
      const { reportId } = req.params;
      const viewerUserId = req.user?.userId;

      logger.logRequest('GET', `/api/access/report/${reportId}`, {});

      if (!viewerUserId) {
        logger.warn('ACCESS', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Check if user owns the report OR has been granted access
      let hasAccess = false;
      const submission = await databaseService.getSubmission(reportId, viewerUserId);

      if (submission) {
        // User owns the report
        hasAccess = true;
      } else {
        // Check if user has been granted access
        const access = await databaseService.checkAccess(reportId, viewerUserId);
        if (access && access.isActive && (!access.expiresAt || new Date(access.expiresAt) > new Date())) {
          hasAccess = true;
        }
      }

      if (!hasAccess) {
        logger.warn('ACCESS', 'User does not have access to report', { reportId, viewerUserId });
        return res.status(403).json({
          error: true,
          message: 'You do not have access to this report'
        });
      }

      // Get the report (already owns it or has access)
      const report = await databaseService.getSubmission(reportId);

      if (!report) {
        logger.warn('ACCESS', 'Report not found', { reportId });
        return res.status(404).json({
          error: true,
          message: 'Report not found'
        });
      }

      logger.success('ACCESS', 'Report accessed', {
        reportId,
        viewerId: viewerUserId
      });

      // Note: If backend encryption is implemented, decrypt responses/metadata here
      res.status(200).json({
        success: true,
        message: 'Report retrieved',
        data: {
          reportId: report.reportid || report.reportId,
          status: report.status,
          txHash: report.txhash || report.txHash,
          ipfsHash: report.ipfshash || report.ipfsHash,
          responses: report.responses,
          metadata: report.metadata,
          createdAt: report.createdat || report.createdAt,
          confirmedAt: report.confirmedat || report.confirmedAt,
          gasUsed: report.gasused || report.gasUsed
        }
      });

    } catch (error) {
      logger.error('ACCESS', 'View report failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to retrieve report',
        code: 'VIEW_REPORT_FAILED'
      });
    }
  }
}

module.exports = new AccessController();
