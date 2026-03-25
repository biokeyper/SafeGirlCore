/**
 * Notification Controller
 * Handles user notifications
 */

import { Request, Response, NextFunction } from "express";
import databaseService from "../services/database";
import logger from "../utils/logger";

class NotificationController {
  /**
   * Get all notifications for authenticated user
   * GET /api/notifications
   *
   * Query params:
   * - isRead: true/false (filter by read status)
   * - type: access_granted, panic_alert, report_submitted, etc
   * - limit: results per page (default 20, max 100)
   * - offset: pagination offset (default 0)
   */
  async getNotifications(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { isRead, type, limit = 20, offset = 0 } = req.query;

      logger.logRequest("GET", "/api/notifications", {
        userId,
        isRead,
        type,
        limit,
        offset,
      });

      if (!userId) {
        logger.warn("NOTIFICATION", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      // Validate limit
      const parsedLimit = Math.min(parseInt(limit as string) || 20, 100);
      const parsedOffset = Math.max(parseInt(offset as string) || 0, 0);

      // Build filters
      const filters: Record<string, any> = {
        userId,
        limit: parsedLimit,
        offset: parsedOffset,
      };

      if (isRead !== undefined) {
        filters.isRead = isRead === "true" || isRead as any === true;
      }

      if (type) {
        filters.type = type;
      }

      logger.info("NOTIFICATION", "Fetching notifications", { userId, filters });

      const result = await (databaseService as any).getNotifications(filters);

      logger.success("NOTIFICATION", "Notifications retrieved", {
        userId,
        count: result.notifications.length,
        total: result.total,
      });

      if (result.notifications.length > 0) {
        logger.info("NOTIFICATION", "Raw DB notification:", {
          firstNotification: result.notifications[0],
          keys: Object.keys(result.notifications[0]),
        });
      }

      res.status(200).json({
        success: true,
        message: "Notifications retrieved",
        data: {
          notifications: result.notifications.map((n: any) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            relatedId: n.relatedid,
            isRead: n.isread,
            createdAt: n.createdat,
            readAt: n.readat,
          })),
          pagination: {
            total: result.total,
            limit: parsedLimit,
            offset: parsedOffset,
            unreadCount: result.unreadCount || 0,
          },
        },
      });
    } catch (error) {
      logger.error("NOTIFICATION", "Get notifications failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to retrieve notifications",
        code: "GET_NOTIFICATIONS_FAILED",
      });
    }
  }

  /**
   * Mark notification as read
   * POST /api/notifications/:notificationId/read
   * Protected: User must be authenticated
   */
  async markAsRead(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { notificationId } = req.params;

      logger.logRequest("POST", `/api/notifications/${notificationId}/read`, {
        userId,
      });

      if (!userId) {
        logger.warn("NOTIFICATION", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      // Mark as read
      const notification = await (databaseService as any).markNotificationAsRead(
        notificationId,
        userId
      );

      if (!notification) {
        logger.warn("NOTIFICATION", "Notification not found", {
          notificationId,
          userId,
        });
        res.status(404).json({
          error: true,
          message: "Notification not found or does not belong to you",
        });
        return;
      }

      logger.success("NOTIFICATION", "Notification marked as read", {
        notificationId,
        userId,
      });

      res.status(200).json({
        success: true,
        message: "Notification marked as read",
        data: {
          notificationId,
          isRead: notification.isRead,
          readAt: notification.readAt,
        },
      });
    } catch (error) {
      logger.error("NOTIFICATION", "Mark as read failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to mark notification as read",
        code: "MARK_READ_FAILED",
      });
    }
  }

  /**
   * Mark all notifications as read
   * POST /api/notifications/mark-all-read
   * Protected: User must be authenticated
   */
  async markAllAsRead(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      logger.logRequest("POST", "/api/notifications/mark-all-read", { userId });

      if (!userId) {
        logger.warn("NOTIFICATION", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      const result = await (databaseService as any).markAllNotificationsAsRead(
        userId
      );

      logger.success("NOTIFICATION", "All notifications marked as read", {
        userId,
        count: result.count,
      });

      res.status(200).json({
        success: true,
        message: "All notifications marked as read",
        data: {
          marked: result.count,
        },
      });
    } catch (error) {
      logger.error("NOTIFICATION", "Mark all as read failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to mark all notifications as read",
        code: "MARK_ALL_FAILED",
      });
    }
  }

  /**
   * Delete a notification
   * DELETE /api/notifications/:notificationId
   * Protected: User must be authenticated
   */
  async deleteNotification(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { notificationId } = req.params;

      logger.logRequest("DELETE", `/api/notifications/${notificationId}`, {
        userId,
      });

      if (!userId) {
        logger.warn("NOTIFICATION", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      const deleted = await (databaseService as any).deleteNotification(
        notificationId,
        userId
      );

      if (!deleted) {
        logger.warn("NOTIFICATION", "Notification not found", {
          notificationId,
          userId,
        });
        res.status(404).json({
          error: true,
          message: "Notification not found",
        });
        return;
      }

      logger.success("NOTIFICATION", "Notification deleted", {
        notificationId,
        userId,
      });

      res.status(200).json({
        success: true,
        message: "Notification deleted",
      });
    } catch (error) {
      logger.error("NOTIFICATION", "Delete notification failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to delete notification",
        code: "DELETE_NOTIFICATION_FAILED",
      });
    }
  }

  /**
   * Get unread notification count
   * GET /api/notifications/unread/count
   * Protected: User must be authenticated
   */
  async getUnreadCount(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      logger.logRequest("GET", "/api/notifications/unread/count", { userId });

      if (!userId) {
        logger.warn("NOTIFICATION", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      const count = await (databaseService as any).getUnreadNotificationCount(
        userId
      );

      res.status(200).json({
        success: true,
        data: {
          unreadCount: count,
        },
      });
    } catch (error) {
      logger.error("NOTIFICATION", "Get unread count failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to get unread count",
        code: "GET_UNREAD_COUNT_FAILED",
      });
    }
  }
}

export default new NotificationController();
