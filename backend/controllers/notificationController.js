/**
 * Notification Controller
 * Handles user notifications
 */

const databaseService = require('../services/database');
const logger = require('../utils/logger');

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
  async getNotifications(req, res, next) {
    try {
      const userId = req.user?.userId;
      const { isRead, type, limit = 20, offset = 0 } = req.query;

      logger.logRequest('GET', '/api/notifications', {
        userId,
        isRead,
        type,
        limit,
        offset
      });

      if (!userId) {
        logger.warn('NOTIFICATION', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Validate limit
      const parsedLimit = Math.min(parseInt(limit) || 20, 100);
      const parsedOffset = Math.max(parseInt(offset) || 0, 0);

      // Build filters
      const filters = {
        userId,
        limit: parsedLimit,
        offset: parsedOffset
      };

      if (isRead !== undefined) {
        filters.isRead = isRead === 'true' || isRead === true;
      }

      if (type) {
        filters.type = type;
      }

      logger.info('NOTIFICATION', 'Fetching notifications', { userId, filters });

      const result = await databaseService.getNotifications(filters);

      logger.success('NOTIFICATION', 'Notifications retrieved', {
        userId,
        count: result.notifications.length,
        total: result.total
      });

      res.status(200).json({
        success: true,
        message: 'Notifications retrieved',
        data: {
          notifications: result.notifications.map(n => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            relatedId: n.relatedId,
            isRead: n.isRead,
            createdAt: n.createdAt,
            readAt: n.readAt
          })),
          pagination: {
            total: result.total,
            limit: parsedLimit,
            offset: parsedOffset,
            unreadCount: result.unreadCount || 0
          }
        }
      });

    } catch (error) {
      logger.error('NOTIFICATION', 'Get notifications failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to retrieve notifications',
        code: 'GET_NOTIFICATIONS_FAILED'
      });
    }
  }

  /**
   * Mark notification as read
   * POST /api/notifications/:notificationId/read
   * Protected: User must be authenticated
   */
  async markAsRead(req, res, next) {
    try {
      const userId = req.user?.userId;
      const { notificationId } = req.params;

      logger.logRequest('POST', `/api/notifications/${notificationId}/read`, {
        userId
      });

      if (!userId) {
        logger.warn('NOTIFICATION', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Mark as read
      const notification = await databaseService.markNotificationAsRead(
        notificationId,
        userId
      );

      if (!notification) {
        logger.warn('NOTIFICATION', 'Notification not found', {
          notificationId,
          userId
        });
        return res.status(404).json({
          error: true,
          message: 'Notification not found or does not belong to you'
        });
      }

      logger.success('NOTIFICATION', 'Notification marked as read', {
        notificationId,
        userId
      });

      res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        data: {
          notificationId,
          isRead: notification.isRead,
          readAt: notification.readAt
        }
      });

    } catch (error) {
      logger.error('NOTIFICATION', 'Mark as read failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to mark notification as read',
        code: 'MARK_READ_FAILED'
      });
    }
  }

  /**
   * Mark all notifications as read
   * POST /api/notifications/mark-all-read
   * Protected: User must be authenticated
   */
  async markAllAsRead(req, res, next) {
    try {
      const userId = req.user?.userId;

      logger.logRequest('POST', '/api/notifications/mark-all-read', { userId });

      if (!userId) {
        logger.warn('NOTIFICATION', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      const result = await databaseService.markAllNotificationsAsRead(userId);

      logger.success('NOTIFICATION', 'All notifications marked as read', {
        userId,
        count: result.count
      });

      res.status(200).json({
        success: true,
        message: 'All notifications marked as read',
        data: {
          marked: result.count
        }
      });

    } catch (error) {
      logger.error('NOTIFICATION', 'Mark all as read failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to mark all notifications as read',
        code: 'MARK_ALL_FAILED'
      });
    }
  }

  /**
   * Delete a notification
   * DELETE /api/notifications/:notificationId
   * Protected: User must be authenticated
   */
  async deleteNotification(req, res, next) {
    try {
      const userId = req.user?.userId;
      const { notificationId } = req.params;

      logger.logRequest('DELETE', `/api/notifications/${notificationId}`, {
        userId
      });

      if (!userId) {
        logger.warn('NOTIFICATION', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      const deleted = await databaseService.deleteNotification(
        notificationId,
        userId
      );

      if (!deleted) {
        logger.warn('NOTIFICATION', 'Notification not found', {
          notificationId,
          userId
        });
        return res.status(404).json({
          error: true,
          message: 'Notification not found'
        });
      }

      logger.success('NOTIFICATION', 'Notification deleted', {
        notificationId,
        userId
      });

      res.status(200).json({
        success: true,
        message: 'Notification deleted'
      });

    } catch (error) {
      logger.error('NOTIFICATION', 'Delete notification failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to delete notification',
        code: 'DELETE_NOTIFICATION_FAILED'
      });
    }
  }

  /**
   * Get unread notification count
   * GET /api/notifications/unread/count
   * Protected: User must be authenticated
   */
  async getUnreadCount(req, res, next) {
    try {
      const userId = req.user?.userId;

      logger.logRequest('GET', '/api/notifications/unread/count', { userId });

      if (!userId) {
        logger.warn('NOTIFICATION', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      const count = await databaseService.getUnreadNotificationCount(userId);

      res.status(200).json({
        success: true,
        data: {
          unreadCount: count
        }
      });

    } catch (error) {
      logger.error('NOTIFICATION', 'Get unread count failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to get unread count',
        code: 'GET_UNREAD_COUNT_FAILED'
      });
    }
  }
}

module.exports = new NotificationController();
