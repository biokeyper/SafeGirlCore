/**
 * User Profile Routes
 * Handles user profile management (username, profile picture)
 */

import { Router, Request, Response, NextFunction } from 'express';
import userProfileController from '../controllers/userProfileController';
import authMiddleware from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/user/profile/update
 * Update authenticated user's profile (username, profile picture)
 * Protected: Requires authentication
 *
 * Body:
 * {
 *   "username": "jane_doe",        // Optional: 3-50 chars, alphanumeric + underscore + dot
 *   "profilePicture": "https://..." // Optional: valid URL
 * }
 */
router.post('/update', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userProfileController.updateProfile(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/user/profile
 * Get authenticated user's own profile
 * Protected: Requires authentication
 */
router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userProfileController.getOwnProfile(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/user/profile/username/:username
 * Get user profile by username (public)
 * Anyone can look up a user's public profile by username
 */
router.get('/username/:username', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userProfileController.getProfileByUsername(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/user/profile/phone/:phone
 * Get user profile by phone (public)
 * Anyone can look up a user's public profile by phone number (for sharing)
 * Phone should be in E.164 format (+256750902921)
 */
router.get('/phone/:phone', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userProfileController.getProfileByPhone(req, res, next);
  } catch (error) {
    next(error);
  }
});

export default router;
