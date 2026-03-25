/**
 * Notification Routes
 * Notification management endpoints
 */

import express, { Request, Response, NextFunction } from 'express';
const router = express.Router();

import notificationController from '../controllers/notificationController';
import authMiddleware from '../middleware/auth';

/**
 * All notification routes require authentication
 */
router.use(authMiddleware);

/**
 * GET /api/notifications
 * Get notifications for authenticated user
 * Query: isRead, type, limit, offset
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationController.getNotifications(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/notifications/unread/count
 * Get unread notification count
 */
router.get('/unread/count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationController.getUnreadCount(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/notifications/:notificationId/read
 * Mark notification as read
 */
router.post('/:notificationId/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationController.markAsRead(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read
 */
router.post('/mark-all-read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationController.markAllAsRead(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/notifications/:notificationId
 * Delete a notification
 */
router.delete('/:notificationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationController.deleteNotification(req, res, next);
  } catch (error) {
    next(error);
  }
});

export default router;
