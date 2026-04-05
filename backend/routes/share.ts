/**
 * Share Routes
 * Phone-based report sharing with deep linking
 */

import express, { Request, Response, NextFunction } from 'express';
const router = express.Router();

import shareController from '../controllers/shareController';
import authMiddleware from '../middleware/auth';

/**
 * POST /api/share/generate
 * Generate a shareable link for a report
 * Protected: User must be authenticated
 */
router.post('/generate', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await shareController.generateShareLink(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/share/claim/:shareToken
 * Claim a share link (called after user signs in)
 * Protected: User must be authenticated
 */
router.post('/claim/:shareToken', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await shareController.claimShareLink(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/share/my-links
 * Get all share links I've created
 * Protected: User must be authenticated
 */
router.get(
  '/my-links',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await shareController.getMyShareLinks(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/share/revoke/:shareToken
 * Revoke a share link
 * Protected: User must be authenticated and own the report
 */
router.delete('/revoke/:shareToken', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await shareController.revokeShareLink(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/share/info/:shareToken
 * Get share link info (for preview before claiming)
 * Public: No authentication required
 */
router.get('/info/:shareToken', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await shareController.getShareLinkInfo(req, res, next);
  } catch (error) {
    next(error);
  }
});

export default router;
