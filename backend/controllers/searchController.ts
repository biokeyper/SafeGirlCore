/**
 * Search Controller
 * Handles report search and filtering
 */

import { Request, Response, NextFunction } from "express";
import databaseService from "../services/database";
import logger from "../utils/logger";

class SearchController {
  /**
   * Search and filter reports
   * GET /api/search/reports
   *
   * Query params:
   * - status: pending, submitted, failed, archived
   * - createdAfter: ISO date string
   * - createdBefore: ISO date string
   * - limit: results per page (default 10, max 100)
   * - offset: pagination offset (default 0)
   */
  async searchReports(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { status, createdAfter, createdBefore, limit = 10, offset = 0 } =
        req.query;

      logger.logRequest("GET", "/api/search/reports", {
        userId,
        status,
        createdAfter,
        createdBefore,
        limit,
        offset,
      });

      if (!userId) {
        logger.warn("SEARCH", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      // Validate limit (max 100 results per page)
      const parsedLimit = Math.min(
        parseInt(limit as string) || 10,
        100
      );
      const parsedOffset = Math.max(parseInt(offset as string) || 0, 0);

      // Build filter conditions
      const filters: Record<string, any> = {
        userId,
        limit: parsedLimit,
        offset: parsedOffset,
      };

      if (status) {
        if (!["pending", "submitted", "failed", "archived"].includes(status as string)) {
          logger.warn("SEARCH", "Invalid status filter", { status });
          res.status(400).json({
            error: true,
            message:
              "Invalid status. Must be: pending, submitted, failed, or archived",
          });
          return;
        }
        filters.status = status;
      }

      if (createdAfter) {
        const afterDate = new Date(createdAfter as string);
        if (isNaN(afterDate.getTime())) {
          logger.warn("SEARCH", "Invalid createdAfter date", { createdAfter });
          res.status(400).json({
            error: true,
            message: "Invalid createdAfter date format (use ISO 8601)",
          });
          return;
        }
        filters.createdAfter = afterDate;
      }

      if (createdBefore) {
        const beforeDate = new Date(createdBefore as string);
        if (isNaN(beforeDate.getTime())) {
          logger.warn("SEARCH", "Invalid createdBefore date", { createdBefore });
          res.status(400).json({
            error: true,
            message: "Invalid createdBefore date format (use ISO 8601)",
          });
          return;
        }
        filters.createdBefore = beforeDate;
      }

      logger.info("SEARCH", "Searching reports", { userId, filters });

      // Search reports
      const result = await (databaseService as any).searchReports(filters);

      logger.success("SEARCH", "Reports searched", {
        userId,
        found: result.reports.length,
        total: result.total,
      });

      res.status(200).json({
        success: true,
        message: "Reports searched successfully",
        data: {
          reports: result.reports.map((r: any) => ({
            reportId: r.reportId,
            txHash: r.txHash,
            ipfsHash: r.ipfsHash,
            ipfsGatewayUrl: r.ipfsHash
              ? `https://gateway.pinata.cloud/ipfs/${r.ipfsHash}`
              : null,
            type: r.type,
            status: r.status,
            confirmations: r.confirmations || 0,
            blockNumber: r.blockNumber,
            gasUsed: r.gasUsed,
            createdAt: r.createdAt,
            submittedAt: r.submittedAt,
            isArchived: r.isArchived || r.isarchived || false,
            metadata: r.metadata,
          })),
          pagination: {
            total: result.total,
            limit: parsedLimit,
            offset: parsedOffset,
            hasMore: result.total > parsedOffset + parsedLimit,
          },
        },
      });
    } catch (error) {
      logger.error("SEARCH", "Search failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to search reports",
        code: "SEARCH_FAILED",
      });
    }
  }

  /**
   * Get report statistics for user
   * GET /api/search/stats
   * Protected: User must be authenticated
   */
  async getReportStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      logger.logRequest("GET", "/api/search/stats", { userId });

      if (!userId) {
        logger.warn("SEARCH", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      const stats = await (databaseService as any).getReportStats(userId);

      logger.success("SEARCH", "Stats retrieved", {
        userId,
        stats,
      });

      res.status(200).json({
        success: true,
        message: "Report statistics retrieved",
        data: {
          totalReports: stats.total || 0,
          pending: stats.pending || 0,
          submitted: stats.submitted || 0,
          failed: stats.failed || 0,
          archived: stats.archived || 0,
          sharedWithMe: stats.sharedWithMe || 0,
        },
      });
    } catch (error) {
      logger.error("SEARCH", "Get stats failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to get report statistics",
        code: "STATS_FAILED",
      });
    }
  }
}

export default new SearchController();
