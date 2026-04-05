/**
 * Share Controller
 * Handles phone-based report sharing with deep linking
 * Users can share reports via links without needing recipient's userId
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import databaseService from '../services/database';
import logger from '../utils/logger';

class ShareController {
  /**
   * Generate a shareable link for a report
   * POST /api/share/generate
   *
   * Body:
   * {
   *   reportId: "report_...",
   *   recipientPhone?: "+256750902921",  // Optional: specific phone
   *   message?: "Please review this",    // Optional: share message
   *   expiresIn?: 2592000                // Optional: seconds (default 30 days)
   * }
   *
   * Response:
   * {
   *   shareToken: "abc123def456...",
   *   deepLink: "safegirl://share/abc123def456...",
   *   shortLink: "https://safegirl.app/share/abc123def456..."
   * }
   */
  async generateShareLink(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { reportId, recipientPhone, message, expiresIn } = req.body;
      const reporterId = req.user?.userId;

      logger.logRequest('POST', '/api/share/generate', { reportId, recipientPhone });

      if (!reportId) {
        logger.warn('SHARE', 'Missing reportId', { reporterId });
        res.status(400).json({
          error: true,
          message: 'reportId is required',
        });
        return;
      }

      if (!reporterId) {
        logger.warn('SHARE', 'User not authenticated', {});
        res.status(401).json({
          error: true,
          message: 'Authentication required',
        });
        return;
      }

      // Verify report exists and is owned by user
      const submission = await (databaseService as any).getSubmission(reportId, reporterId);
      if (!submission) {
        logger.warn('SHARE', 'Report not found or not owned by user', {
          reportId,
          reporterId,
        });
        res.status(404).json({
          error: true,
          message: 'Report not found or you do not own this report',
        });
        return;
      }

      // Generate secure random token (32 bytes = 256 bits)
      const shareToken = crypto.randomBytes(32).toString('hex');

      // Calculate expiry time
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

      // Save share link to database
      const shareLink = await (databaseService as any).createShareLink({
        reportId,
        reporterId,
        shareToken,
        recipientPhone: recipientPhone || null,
        expiresAt,
        message: message || null,
      });

      logger.success('SHARE', 'Share link generated', {
        reportId,
        reporterId,
        recipientPhone: recipientPhone || 'public',
      });

      // Generate deep link and short link
      const deepLink = `safegirl://share/${shareToken}`;
      const shortLink = `${process.env.FRONTEND_URL || 'https://safegirl.app'}/share/${shareToken}`;

      res.status(200).json({
        success: true,
        message: 'Share link generated successfully',
        data: {
          shareToken: shareToken,
          deepLink,
          shortLink,
          expiresAt: expiresAt.toISOString(),
          recipientPhone: recipientPhone || 'public (anyone with link)',
        },
      });
    } catch (error) {
      logger.error('SHARE', 'Generate share link failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: 'Failed to generate share link',
        code: 'GENERATE_SHARE_LINK_FAILED',
      });
    }
  }

  /**
   * Claim a share link and grant access
   * Called after user signs in following a share link click
   * POST /api/share/claim/:shareToken
   *
   * Protected: User must be authenticated
   * Called automatically during auth flow for shared reports
   */
  async claimShareLink(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { shareToken: shareTokenRaw } = req.params;
      const shareToken = typeof shareTokenRaw === 'string' ? shareTokenRaw : '';
      const userId = req.user?.userId;

      logger.logRequest('POST', '/api/share/claim/:shareToken', { userId });

      if (!userId) {
        logger.warn('SHARE', 'User not authenticated', {});
        res.status(401).json({
          error: true,
          message: 'Authentication required',
        });
        return;
      }

      if (!shareToken) {
        logger.warn('SHARE', 'Missing shareToken', { userId });
        res.status(400).json({
          error: true,
          message: 'shareToken is required',
        });
        return;
      }

      // Get share link
      const shareLink = await (databaseService as any).getShareLinkByToken(shareToken);
      if (!shareLink) {
        logger.warn('SHARE', 'Share link not found', { shareToken });
        res.status(404).json({
          error: true,
          message: 'Share link not found or has expired',
        });
        return;
      }

      // Check if link has expired
      if (new Date(shareLink.expires_at) < new Date()) {
        logger.warn('SHARE', 'Share link expired', { shareToken });
        res.status(410).json({
          error: true,
          message: 'This share link has expired',
        });
        return;
      }

      // Check if link has been claimed and max_claims is reached
      if (shareLink.max_claims && shareLink.claim_count >= shareLink.max_claims) {
        logger.warn('SHARE', 'Share link claim limit reached', { shareToken });
        res.status(410).json({
          error: true,
          message: 'This share link has already been used',
        });
        return;
      }

      // Check if recipient phone matches (if specified)
      if (shareLink.recipient_phone) {
        const userPhone = await (databaseService as any).query(
          'SELECT phone FROM users WHERE userid = $1',
          [userId]
        );

        const userPhoneValue = userPhone.rows?.[0]?.phone;
        if (userPhoneValue !== shareLink.recipient_phone) {
          logger.warn('SHARE', 'Share link recipient phone mismatch', {
            shareToken,
            expectedPhone: shareLink.recipient_phone,
            userPhone: userPhoneValue,
          });
          res.status(403).json({
            error: true,
            message: 'This share link is not intended for your phone number',
          });
          return;
        }
      }

      // Claim the link
      const claimedLink = await (databaseService as any).claimShareLink(shareToken, userId);

      // Grant access to the report (create access record)
      const accessExpiresAt = shareLink.access_expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year default

      const access = await (databaseService as any).grantAccess({
        reportId: shareLink.report_id,
        reporterId: shareLink.reporter_id,
        viewerId: userId,
        expiresAt: accessExpiresAt,
        txHash: null,
      });

      logger.success('SHARE', 'Share link claimed and access granted', {
        shareToken: shareToken.substring(0, 8) + '...',
        userId,
        reportId: shareLink.report_id,
      });

      res.status(200).json({
        success: true,
        message: 'Access granted successfully',
        data: {
          reportId: shareLink.report_id,
          accessId: access.id,
          expiresAt: accessExpiresAt.toISOString(),
        },
      });
    } catch (error) {
      logger.error('SHARE', 'Claim share link failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: 'Failed to claim share link',
        code: 'CLAIM_SHARE_LINK_FAILED',
      });
    }
  }

  /**
   * Get my share links (reports I've shared)
   * GET /api/share/my-links?limit=10&offset=0
   * Protected: User must be authenticated
   */
  async getMyShareLinks(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { limit = 10, offset = 0 } = req.query;

      logger.logRequest('GET', '/api/share/my-links', { userId });

      if (!userId) {
        logger.warn('SHARE', 'User not authenticated', {});
        res.status(401).json({
          error: true,
          message: 'Authentication required',
        });
        return;
      }

      const parsedLimit = typeof limit === 'string' ? parseInt(limit) : 10;
      const parsedOffset = typeof offset === 'string' ? parseInt(offset) : 0;

      const shareLinks = await (databaseService as any).getShareLinksByReporter(
        userId,
        parsedLimit,
        parsedOffset
      );

      logger.success('SHARE', 'Retrieved my share links', {
        userId,
        count: shareLinks.length,
      });

      res.status(200).json({
        success: true,
        data: {
          shareLinks: shareLinks.map((link: any) => {
            const token = typeof link.share_token === 'string' ? link.share_token : '';
            return {
              id: link.id,
              reportId: link.report_id,
              shareToken: token.substring(0, 8) + '...',
              shareTokenFull: token,
              recipientPhone: link.recipient_phone || 'public',
              status: link.status,
              claimedBy: link.claimed_by_user_id,
              claimCount: link.claim_count,
              maxClaims: link.max_claims,
              expiresAt: link.expires_at,
              claimedAt: link.claimed_at,
              createdAt: link.created_at,
            };
          }),
          totalCount: shareLinks.length,
        },
      });
    } catch (error) {
      logger.error('SHARE', 'Get my share links failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: 'Failed to retrieve share links',
        code: 'GET_SHARE_LINKS_FAILED',
      });
    }
  }

  /**
   * Revoke a share link
   * DELETE /api/share/revoke/:shareToken
   * Protected: User must be authenticated and own the original report
   */
  async revokeShareLink(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { shareToken: shareTokenRaw } = req.params;
      const shareToken = typeof shareTokenRaw === 'string' ? shareTokenRaw : '';
      const userId = req.user?.userId;

      logger.logRequest('DELETE', '/api/share/revoke/:shareToken', { userId });

      if (!userId) {
        logger.warn('SHARE', 'User not authenticated', {});
        res.status(401).json({
          error: true,
          message: 'Authentication required',
        });
        return;
      }

      // Get share link
      const shareLink = await (databaseService as any).getShareLinkByToken(shareToken);
      if (!shareLink) {
        logger.warn('SHARE', 'Share link not found', { shareToken });
        res.status(404).json({
          error: true,
          message: 'Share link not found',
        });
        return;
      }

      // Verify user owns the report
      if (shareLink.reporter_id !== userId) {
        logger.warn('SHARE', 'Share link not owned by user', {
          shareToken,
          userId,
          reporterId: shareLink.reporter_id,
        });
        res.status(403).json({
          error: true,
          message: 'You do not have permission to revoke this share link',
        });
        return;
      }

      // Delete the share link
      await (databaseService as any).query('DELETE FROM report_share_links WHERE share_token = $1', [
        shareToken,
      ]);

      logger.success('SHARE', 'Share link revoked', {
        userId,
        shareToken: shareToken.substring(0, 8) + '...',
      });

      res.status(200).json({
        success: true,
        message: 'Share link revoked successfully',
      });
    } catch (error) {
      logger.error('SHARE', 'Revoke share link failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: 'Failed to revoke share link',
        code: 'REVOKE_SHARE_LINK_FAILED',
      });
    }
  }

  /**
   * Get share link info (for preview before claiming)
   * GET /api/share/info/:shareToken
   * Public: No authentication required
   */
  async getShareLinkInfo(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { shareToken: shareTokenRaw } = req.params;
      const shareToken = typeof shareTokenRaw === 'string' ? shareTokenRaw : '';

      logger.logRequest('GET', '/api/share/info/:shareToken');

      // Get share link
      const shareLink = await (databaseService as any).getShareLinkByToken(shareToken);
      if (!shareLink) {
        logger.warn('SHARE', 'Share link not found', { shareToken });
        res.status(404).json({
          error: true,
          message: 'Share link not found',
        });
        return;
      }

      // Check if link has expired
      if (new Date(shareLink.expires_at) < new Date()) {
        logger.warn('SHARE', 'Share link expired', { shareToken });
        res.status(410).json({
          error: true,
          message: 'This share link has expired',
        });
        return;
      }

      // Check if link has been claimed
      if (shareLink.status === 'claimed' && shareLink.max_claims === 1) {
        logger.warn('SHARE', 'Share link already used', { shareToken });
        res.status(410).json({
          error: true,
          message: 'This share link has already been used',
        });
        return;
      }

      logger.success('SHARE', 'Retrieved share link info', { shareToken: shareToken.substring(0, 8) + '...' });

      res.status(200).json({
        success: true,
        data: {
          isValid: true,
          message: shareLink.message,
          expiresAt: shareLink.expires_at,
          requiresPhone: !!shareLink.recipient_phone,
          recipientPhone: shareLink.recipient_phone,
        },
      });
    } catch (error) {
      logger.error('SHARE', 'Get share link info failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: 'Failed to retrieve share link info',
        code: 'GET_SHARE_INFO_FAILED',
      });
    }
  }
}

export default new ShareController();
