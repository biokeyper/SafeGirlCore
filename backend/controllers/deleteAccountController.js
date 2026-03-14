/**
 * Delete Account Controller
 * Handles complete account deletion and data cleanup
 */

const databaseService = require('../services/database');
const logger = require('../utils/logger');

class DeleteAccountController {

  /**
   * Delete user account and all associated data
   * POST /api/auth/delete-account
   * Protected: User must be authenticated
   *
   * Body:
   * {
   *   "password": "user's OTP or confirmation token"
   * }
   */
  async deleteAccount(req, res, next) {
    const userId = req.user?.userId;

    try {
      logger.logRequest('POST', '/api/auth/delete-account', { userId });

      if (!userId) {
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Get user info first
      const userResult = await databaseService.query(
        'SELECT userid, phone, email FROM users WHERE userid = $1',
        [userId]
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        logger.warn('DELETE_ACCOUNT', 'User not found', { userId });
        return res.status(404).json({
          error: true,
          message: 'User not found'
        });
      }

      const user = userResult.rows[0];

      logger.info('DELETE_ACCOUNT', 'Starting account deletion process', {
        userId,
        phone: user.phone,
        email: user.email
      });

      // ========== DELETE ALL USER DATA ==========
      // 1. Delete panic alerts and audit logs
      await databaseService.query(
        'DELETE FROM panic_audit_log WHERE userid = $1',
        [userId]
      );
      logger.info('DELETE_ACCOUNT', 'Deleted panic audit logs', { userId });

      await databaseService.query(
        'DELETE FROM panic_alerts WHERE userid = $1',
        [userId]
      );
      logger.info('DELETE_ACCOUNT', 'Deleted panic alerts', { userId });

      // 2. Delete emergency contacts
      await databaseService.query(
        'DELETE FROM emergency_contacts WHERE userid = $1',
        [userId]
      );
      logger.info('DELETE_ACCOUNT', 'Deleted emergency contacts', { userId });

      // 3. Delete notifications
      await databaseService.query(
        'DELETE FROM notifications WHERE userid = $1',
        [userId]
      );
      logger.info('DELETE_ACCOUNT', 'Deleted notifications', { userId });

      // 4. Delete report access grants (both as reporter and viewer)
      await databaseService.query(
        'DELETE FROM report_access WHERE reporterid = $1 OR viewerid = $1',
        [userId]
      );
      logger.info('DELETE_ACCOUNT', 'Deleted report access grants', { userId });

      // 5. Delete submissions (reports) - this cascades to related data
      await databaseService.query(
        'DELETE FROM submissions WHERE userid = $1',
        [userId]
      );
      logger.info('DELETE_ACCOUNT', 'Deleted all submissions', { userId });

      // 6. Delete key backups
      await databaseService.query(
        'DELETE FROM key_backups WHERE userid = $1',
        [userId]
      );
      logger.info('DELETE_ACCOUNT', 'Deleted key backups', { userId });

      // 7. Delete OTP records
      await databaseService.query(
        'DELETE FROM otps WHERE phone = $1',
        [user.phone]
      );
      logger.info('DELETE_ACCOUNT', 'Deleted OTP records', { userId });

      // 8. Finally, delete user account
      await databaseService.query(
        'DELETE FROM users WHERE userid = $1',
        [userId]
      );
      logger.info('DELETE_ACCOUNT', 'Deleted user account', { userId });

      // ========== AUDIT LOG ==========
      logger.warn('DELETE_ACCOUNT', 'Account permanently deleted', {
        userId,
        phone: user.phone,
        email: user.email,
        timestamp: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Account and all associated data have been permanently deleted',
        data: {
          userId: userId,
          deletedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('DELETE_ACCOUNT', 'Account deletion failed', {
        userId,
        error: error.message
      });

      return res.status(500).json({
        error: true,
        message: 'Failed to delete account',
        code: 'DELETE_ACCOUNT_FAILED'
      });
    }
  }
}

module.exports = new DeleteAccountController();
