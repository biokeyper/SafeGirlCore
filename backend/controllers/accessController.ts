/**
 * Access Controller
 * Handles report sharing: grant/revoke access, view shared reports
 */

import { Request, Response, NextFunction } from "express";
import databaseService from "../services/database";
import logger from "../utils/logger";

class AccessController {
  /**
   * Grant access to a specific report to another user
   * POST /api/access/grant
   *
   * Body (userId):
   * {
   *   reportId: "report_...",
   *   grantToUserId: "user_...",
   *   expiresIn: 2592000  // Optional: seconds (default 30 days)
   * }
   *
   * Body (phone - recommended):
   * {
   *   reportId: "report_...",
   *   phone: "+256750902921",  // Phone number to grant access to
   *   expiresIn: 2592000  // Optional: seconds (default 30 days)
   * }
   */
  async grantAccess(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { reportId, grantToUserId, phone, expiresIn } = req.body;
      const reporterUserId = req.user?.userId;

      logger.logRequest("POST", "/api/access/grant", { reportId, grantToUserId, phone });

      if (!reportId) {
        logger.warn("ACCESS", "Missing reportId", {});
        res.status(400).json({
          error: true,
          message: "reportId is required",
        });
        return;
      }

      if (!grantToUserId && !phone) {
        logger.warn("ACCESS", "Missing both grantToUserId and phone", {});
        res.status(400).json({
          error: true,
          message: "Either grantToUserId or phone is required",
        });
        return;
      }

      if (!reporterUserId) {
        logger.warn("ACCESS", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      let targetUserId = grantToUserId;

      // If phone provided, look up userId
      if (phone) {
        const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
        const userResult = await (databaseService as any).query(
          `SELECT userid FROM users WHERE phone = $1 LIMIT 1`,
          [normalizedPhone]
        );

        if (!userResult.rows || userResult.rows.length === 0) {
          logger.warn("ACCESS", "User not found by phone", { phone: normalizedPhone });
          res.status(404).json({
            error: true,
            message: "User not found with that phone number",
            code: "USER_NOT_FOUND",
          });
          return;
        }

        targetUserId = userResult.rows[0].userid;
      }

      if (targetUserId === reporterUserId) {
        logger.warn("ACCESS", "Cannot grant access to self", {
          reportId,
          userId: reporterUserId,
        });
        res.status(400).json({
          error: true,
          message: "Cannot grant access to yourself - you already own this report",
        });
        return;
      }

      const submission = await (databaseService as any).getSubmission(
        reportId,
        reporterUserId
      );
      if (!submission) {
        logger.warn("ACCESS", "Report not found or not owned by user", {
          reportId,
          reporterUserId,
        });
        res.status(404).json({
          error: true,
          message: "Report not found or you do not own this report",
        });
        return;
      }

      // Check if target user exists
      const targetUser = await (databaseService as any).getUser(targetUserId);
      if (!targetUser) {
        logger.warn("ACCESS", "Target user does not exist", { targetUserId });
        res.status(404).json({
          error: true,
          message: "User does not exist",
        });
        return;
      }

      // Calculate expiry time
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

      logger.info("ACCESS", "Granting access to user", { reportId, targetUserId });

      const access = await (databaseService as any).grantAccess({
        reportId,
        reporterId: reporterUserId,
        viewerId: targetUserId,
        expiresAt,
        txHash: null,
      });

      logger.success("ACCESS", "Access saved to database", {
        reportId,
        grantToUserId: targetUserId,
        accessId: access.id,
      });

      res.status(200).json({
        success: true,
        message: "Access granted successfully",
        data: {
          accessId: access.id,
          reportId,
          grantedTo: targetUserId,
          grantedToPhone: targetUser.phone,
          expiresAt: expiresAt.toISOString(),
        },
      });
    } catch (error) {
      logger.error("ACCESS", "Grant access failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to grant access",
        code: "GRANT_ACCESS_FAILED",
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
  async revokeAccess(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { reportId, revokeFromUserId } = req.body;
      const reporterUserId = req.user?.userId;

      logger.logRequest("POST", "/api/access/revoke", {
        reportId,
        revokeFromUserId,
      });

      if (!reportId || !revokeFromUserId) {
        logger.warn("ACCESS", "Missing required fields", {
          reportId: !!reportId,
          revokeFromUserId: !!revokeFromUserId,
        });
        res.status(400).json({
          error: true,
          message: "reportId and revokeFromUserId are required",
        });
        return;
      }

      if (!reporterUserId) {
        logger.warn("ACCESS", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      // Check if reporter owns the report
      const submission = await (databaseService as any).getSubmission(
        reportId,
        reporterUserId
      );
      if (!submission) {
        logger.warn("ACCESS", "Report not found or not owned by user", {
          reportId,
          reporterUserId,
        });
        res.status(404).json({
          error: true,
          message: "Report not found or you do not own this report",
        });
        return;
      }

      // Check if target user exists
      const targetUser = await (databaseService as any).getUser(
        revokeFromUserId
      );
      if (!targetUser) {
        logger.warn("ACCESS", "Target user does not exist", {
          revokeFromUserId,
        });
        res.status(404).json({
          error: true,
          message: "User does not exist",
        });
        return;
      }

      logger.info("ACCESS", "Revoking access from database", {
        reportId,
        revokeFromUserId,
      });

      await (databaseService as any).revokeAccess(reportId, revokeFromUserId);

      logger.success("ACCESS", "Access revoked in database", {
        reportId,
        revokeFromUserId,
      });

      res.status(200).json({
        success: true,
        message: "Access revoked successfully",
        data: {
          reportId,
          revokedFrom: revokeFromUserId,
        },
      });
    } catch (error) {
      logger.error("ACCESS", "Revoke access failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to revoke access",
        code: "REVOKE_ACCESS_FAILED",
      });
    }
  }

  /**
   * Get all reports I've shared with others
   * GET /api/access/my-shared-reports
   */
  async getMySharedReports(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const reporterUserId = req.user?.userId;

      logger.logRequest("GET", "/api/access/my-shared-reports", {});

      if (!reporterUserId) {
        logger.warn("ACCESS", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      // Get all reports owned by user with access info
      const mySharedReports = await (
        databaseService as any
      ).getMySharedReports(reporterUserId);

      // Fetch full submission data for each shared report
      const reportsWithContent: any[] = [];
      for (const report of mySharedReports) {
        const submission = await (databaseService as any).getSubmission(
          report.reportId,
          reporterUserId
        );
        if (submission) {
          reportsWithContent.push({
            reportId: report.reportId,
            createdAt: report.createdAt,
            status: report.status,
            viewerCount: report.viewerCount,
            isArchived: submission.isarchived || submission.isArchived || false,
            responses: submission.responses,
            metadata: submission.metadata,
            viewers: report.viewers.map((viewer: any) => ({
              viewerId: viewer.viewerid || viewer.viewerId,
              phone: viewer.phone,
              email: viewer.email,
              grantedAt: viewer.grantedat || viewer.grantedAt,
              expiresAt: viewer.expiresat || viewer.expiresAt,
              isActive: viewer.isactive || viewer.isActive,
            })),
          });
        }
      }

      logger.success("ACCESS", "Retrieved user's shared reports", {
        reporterId: reporterUserId,
        reportCount: reportsWithContent.length,
      });

      res.status(200).json({
        success: true,
        message: "My shared reports retrieved",
        data: {
          reports: reportsWithContent,
        },
      });
    } catch (error) {
      logger.error("ACCESS", "Get my shared reports failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to retrieve my shared reports",
        code: "GET_MY_SHARED_FAILED",
      });
    }
  }

  /**
   * Get all reports shared with the authenticated user
   * GET /api/access/shared-with-me
   */
  async getSharedReports(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const viewerUserId = req.user?.userId;

      logger.logRequest("GET", "/api/access/shared-with-me", {});

      if (!viewerUserId) {
        logger.warn("ACCESS", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      // Get all active access grants for this user
      const sharedReports = await (
        databaseService as any
      ).getSharedReports(viewerUserId);

      // Fetch full submission data for each shared report
      const reportsWithContent: any[] = [];
      for (const access of sharedReports) {
        const submission = await (databaseService as any).getSubmission(
          access.reportid,
          viewerUserId
        );
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
            isArchived: submission.isarchived || submission.isArchived || false,
            responses: submission.responses,
            metadata: submission.metadata,
          });
        }
      }

      logger.success("ACCESS", "Retrieved shared reports", {
        viewerId: viewerUserId,
        reportCount: reportsWithContent.length,
      });

      res.status(200).json({
        success: true,
        message: "Shared reports retrieved",
        data: {
          reports: reportsWithContent,
        },
      });
    } catch (error) {
      logger.error("ACCESS", "Get shared reports failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to retrieve shared reports",
        code: "GET_SHARED_FAILED",
      });
    }
  }

  /**
   * Get all users who have access to my report
   * GET /api/access/my-report/:reportId/viewers
   */
  async getReportViewers(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { reportId } = req.params;
      const reporterUserId = req.user?.userId;

      logger.logRequest("GET", `/api/access/my-report/${reportId}/viewers`, {});

      if (!reporterUserId) {
        logger.warn("ACCESS", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      // Verify ownership of report
      const submission = await (databaseService as any).getSubmission(
        reportId,
        reporterUserId
      );
      if (!submission) {
        logger.warn("ACCESS", "Report not found or not owned by user", {
          reportId,
          reporterUserId,
        });
        res.status(404).json({
          error: true,
          message: "Report not found or you do not own this report",
        });
        return;
      }

      // Get all viewers with access to this report
      const viewers = await (databaseService as any).getReportViewers(
        reportId,
        reporterUserId
      );

      logger.success("ACCESS", "Retrieved report viewers", {
        reportId,
        viewerCount: viewers.length,
      });

      res.status(200).json({
        success: true,
        message: "Report viewers retrieved",
        data: {
          reportId,
          viewers: viewers.map((access: any) => ({
            viewerId: access.viewerid || access.viewerId,
            phone: access.phone,
            email: access.email,
            grantedAt: access.grantedat || access.grantedAt,
            expiresAt: access.expiresat || access.expiresAt,
            isActive: access.isactive || access.isActive,
          })),
        },
      });
    } catch (error) {
      logger.error("ACCESS", "Get report viewers failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to retrieve viewers",
        code: "GET_VIEWERS_FAILED",
      });
    }
  }

  /**
   * View a report if user has access
   * GET /api/access/report/:reportId
   */
  async viewReport(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { reportId } = req.params;
      const viewerUserId = req.user?.userId;

      logger.logRequest("GET", `/api/access/report/${reportId}`, {});

      if (!viewerUserId) {
        logger.warn("ACCESS", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      // Check if user owns the report OR has been granted access
      let hasAccess = false;
      const submission = await (databaseService as any).getSubmission(
        reportId,
        viewerUserId
      );

      if (submission) {
        // User owns the report
        hasAccess = true;
      } else {
        // Check if user has been granted access
        const access = await (databaseService as any).checkAccess(
          reportId,
          viewerUserId
        );
        if (
          access &&
          access.isActive &&
          (!access.expiresAt || new Date(access.expiresAt) > new Date())
        ) {
          hasAccess = true;
        }
      }

      if (!hasAccess) {
        logger.warn("ACCESS", "User does not have access to report", {
          reportId,
          viewerUserId,
        });
        res.status(403).json({
          error: true,
          message: "You do not have access to this report",
        });
        return;
      }

      // Get the report (already owns it or has access)
      const report = await (databaseService as any).getSubmission(reportId);

      if (!report) {
        logger.warn("ACCESS", "Report not found", { reportId });
        res.status(404).json({
          error: true,
          message: "Report not found",
        });
        return;
      }

      logger.success("ACCESS", "Report accessed", {
        reportId,
        viewerId: viewerUserId,
      });

      res.status(200).json({
        success: true,
        message: "Report retrieved",
        data: {
          reportId: report.reportid || report.reportId,
          status: report.status,
          txHash: report.txhash || report.txHash,
          ipfsHash: report.ipfshash || report.ipfsHash,
          isArchived: report.isarchived || report.isArchived || false,
          responses: report.responses,
          metadata: report.metadata,
          createdAt: report.createdat || report.createdAt,
          submittedAt: report.submittedat || report.submittedAt,
          gasUsed: report.gasused || report.gasUsed,
        },
      });
    } catch (error) {
      logger.error("ACCESS", "View report failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to retrieve report",
        code: "VIEW_REPORT_FAILED",
      });
    }
  }
}

export default new AccessController();
