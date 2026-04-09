/**
 * User Profile Controller
 * Handles user profile management (username, profile picture)
 */

import { Request, Response, NextFunction } from 'express';
import databaseService from '../services/database';
import logger from '../utils/logger';

// Username validation: 3-50 chars, alphanumeric + underscore + dot
const USERNAME_REGEX = /^[a-zA-Z0-9_.]{3,50}$/;
const MAX_USERNAME_LENGTH = 50;
const MIN_USERNAME_LENGTH = 3;

class UserProfileController {
  /**
   * Update user profile (username, profile picture)
   * POST /api/user/profile/update
   * Protected: User must be authenticated
   *
   * Body:
   * {
   *   "username": "jane_doe",
   *   "profilePicture": "https://cdn.example.com/profile.jpg"
   * }
   */
  async updateProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { username, profilePicture } = req.body;

      logger.logRequest('POST', '/api/user/profile/update', { userId });

      if (!userId) {
        logger.warn('PROFILE', 'User not authenticated', {});
        res.status(401).json({
          error: true,
          message: 'Authentication required',
        });
        return;
      }

      // Validate username if provided
      if (username !== undefined && username !== null) {
        if (typeof username !== 'string') {
          logger.warn('PROFILE', 'Invalid username type', { userId, type: typeof username });
          res.status(400).json({
            error: true,
            message: 'Username must be a string',
          });
          return;
        }

        if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
          logger.warn('PROFILE', 'Username length invalid', { userId, length: username.length });
          res.status(400).json({
            error: true,
            message: `Username must be ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} characters`,
          });
          return;
        }

        if (!USERNAME_REGEX.test(username)) {
          logger.warn('PROFILE', 'Username format invalid', { userId, username });
          res.status(400).json({
            error: true,
            message: 'Username can only contain letters, numbers, underscores, and dots',
          });
          return;
        }

        // Check if username is already taken by another user
        const existingResult = await (databaseService as any).query(
          'SELECT userid FROM users WHERE username = $1 AND userid != $2',
          [username, userId]
        );

        if (existingResult.rows && existingResult.rows.length > 0) {
          logger.warn('PROFILE', 'Username already taken', { userId, username });
          res.status(409).json({
            error: true,
            message: 'This username is already taken',
            code: 'USERNAME_TAKEN',
          });
          return;
        }
      }

      // Validate profile picture URL if provided
      if (profilePicture !== undefined && profilePicture !== null) {
        if (typeof profilePicture !== 'string') {
          logger.warn('PROFILE', 'Invalid profilePicture type', { userId });
          res.status(400).json({
            error: true,
            message: 'Profile picture URL must be a string',
          });
          return;
        }

        // Basic URL validation
        if (profilePicture && !isValidUrl(profilePicture)) {
          logger.warn('PROFILE', 'Invalid profile picture URL', { userId });
          res.status(400).json({
            error: true,
            message: 'Invalid profile picture URL',
          });
          return;
        }
      }

      // Build update query dynamically based on what's provided
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (username !== undefined && username !== null) {
        updates.push(`username = $${paramCount}`);
        values.push(username);
        paramCount++;
      }

      if (profilePicture !== undefined && profilePicture !== null) {
        updates.push(`profilePicture = $${paramCount}`);
        values.push(profilePicture);
        paramCount++;
      }

      if (updates.length === 0) {
        res.status(400).json({
          error: true,
          message: 'No fields to update',
        });
        return;
      }

      values.push(userId);
      const query = `
        UPDATE users
        SET ${updates.join(', ')}, updatedAt = NOW()
        WHERE userid = $${paramCount}
        RETURNING userid, phone, email, username, profilePicture
      `;

      const result = await (databaseService as any).query(query, values);

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to update profile');
      }

      const user = result.rows[0];

      logger.success('PROFILE', 'Profile updated successfully', {
        userId,
        usernameUpdated: !!username,
        profilePictureUpdated: !!profilePicture,
      });

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          userId: user.userid,
          phone: user.phone,
          username: user.username,
          profilePicture: user.profilepicture,
        },
      });
    } catch (error) {
      logger.error('PROFILE', 'Update profile failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }

  /**
   * Get user profile by username
   * GET /api/user/profile/username/:username
   * Public: Anyone can look up a user profile by username
   *
   * Returns: { phone, username, profilePicture }
   */
  async getProfileByUsername(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { username } = req.params;

      logger.logRequest('GET', '/api/user/profile/username/:username', { username });

      if (!username || typeof username !== 'string') {
        logger.warn('PROFILE', 'Missing or invalid username parameter', {});
        res.status(400).json({
          error: true,
          message: 'Username is required',
        });
        return;
      }

      // Look up user by username
      const result = await (databaseService as any).query(
        'SELECT userid, phone, username, profilePicture FROM users WHERE username = $1',
        [username]
      );

      if (!result.rows || result.rows.length === 0) {
        logger.info('PROFILE', 'User not found by username', { username });
        res.status(404).json({
          error: true,
          message: 'User not found',
          code: 'USER_NOT_FOUND',
        });
        return;
      }

      const user = result.rows[0];

      logger.success('PROFILE', 'Profile retrieved by username', { username });

      res.status(200).json({
        success: true,
        data: {
          userId: user.userid,
          phone: user.phone,
          username: user.username,
          profilePicture: user.profilepicture,
        },
      });
    } catch (error) {
      logger.error('PROFILE', 'Get profile by username failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }

  /**
   * Get user profile by phone
   * GET /api/user/profile/phone/:phone
   * Public: Anyone can look up a user profile by phone (for sharing)
   *
   * Returns: { phone, username, profilePicture }
   */
  async getProfileByPhone(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { phone } = req.params;

      logger.logRequest('GET', '/api/user/profile/phone/:phone', { phone });

      if (!phone || typeof phone !== 'string') {
        logger.warn('PROFILE', 'Missing or invalid phone parameter', {});
        res.status(400).json({
          error: true,
          message: 'Phone is required',
        });
        return;
      }

      // Look up user by phone (E.164 format expected)
      const result = await (databaseService as any).query(
        'SELECT userid, phone, username, profilePicture FROM users WHERE phone = $1',
        [phone]
      );

      if (!result.rows || result.rows.length === 0) {
        logger.info('PROFILE', 'User not found by phone', { phone });
        res.status(404).json({
          error: true,
          message: 'User not found',
          code: 'USER_NOT_FOUND',
        });
        return;
      }

      const user = result.rows[0];

      logger.success('PROFILE', 'Profile retrieved by phone', { phone });

      res.status(200).json({
        success: true,
        data: {
          userId: user.userid,
          phone: user.phone,
          username: user.username || null,
          profilePicture: user.profilepicture || null,
        },
      });
    } catch (error) {
      logger.error('PROFILE', 'Get profile by phone failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }

  /**
   * Get own profile (authenticated user)
   * GET /api/user/profile
   * Protected: User must be authenticated
   *
   * Returns: { userId, phone, email, username, profilePicture }
   */
  async getOwnProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      logger.logRequest('GET', '/api/user/profile', { userId });

      if (!userId) {
        logger.warn('PROFILE', 'User not authenticated', {});
        res.status(401).json({
          error: true,
          message: 'Authentication required',
        });
        return;
      }

      // Get authenticated user's profile
      const result = await (databaseService as any).query(
        'SELECT userid, phone, email, username, profilePicture FROM users WHERE userid = $1',
        [userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];

      logger.success('PROFILE', 'Own profile retrieved', { userId });

      res.status(200).json({
        success: true,
        data: {
          userId: user.userid,
          phone: user.phone,
          email: user.email,
          username: user.username || null,
          profilePicture: user.profilepicture || null,
        },
      });
    } catch (error) {
      logger.error('PROFILE', 'Get own profile failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }
}

/**
 * Basic URL validation
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

export default new UserProfileController();
