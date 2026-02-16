/**
 * Panic Alert Controller
 * Handles emergency panic alerts
 */

const blockchainService = require('../services/blockchain');
const databaseService = require('../services/database');
const logger = require('../utils/logger');

class PanicController {

  /**
   * Send panic alert
   * POST /api/panic-alert
   *
   * Body:
   * {
   *   "locationData": "GPS coordinates or address"
   * }
   */
  async sendPanicAlert(req, res, next) {
    try {
      const { locationData } = req.body;
      const userId = req.user?.userId;

      logger.logRequest('POST', '/api/panic-alert', {
        userId,
        hasLocation: !!locationData
      });

      if (!userId) {
        logger.warn('PANIC', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      if (!locationData || typeof locationData !== 'string') {
        logger.warn('PANIC', 'Missing or invalid location data', { userId });
        return res.status(400).json({
          error: true,
          message: 'locationData is required (string)'
        });
      }

      if (locationData.length > 500) {
        logger.warn('PANIC', 'Location data too long', { userId });
        return res.status(400).json({
          error: true,
          message: 'locationData exceeds 500 character limit'
        });
      }

      logger.info('PANIC', 'Processing panic alert', {
        userId,
        locationLength: locationData.length
      });

      // Send panic alert to blockchain
      const walletAddress = blockchainService.getWalletAddress();

      const tx = await blockchainService.sendPanicAlert(locationData);

      logger.success('PANIC', 'Panic alert sent to blockchain', {
        userId,
        txHash: tx.txHash
      });

      // Save to database
      const alertRecord = await databaseService.savePanicAlert({
        userId,
        walletAddress,
        locationData,
        txHash: tx.txHash,
        blockNumber: tx.blockNumber
      });

      logger.success('PANIC', 'Panic alert saved to database', {
        userId,
        alertId: alertRecord.id
      });

      res.status(200).json({
        success: true,
        message: 'Panic alert sent successfully',
        data: {
          alertId: alertRecord.id,
          txHash: tx.txHash,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('PANIC', 'Panic alert failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to send panic alert',
        code: 'PANIC_FAILED'
      });
    }
  }

  /**
   * Get panic alert history
   * GET /api/panic-alert/history
   * Protected: User can only see their own alerts
   */
  async getPanicHistory(req, res, next) {
    try {
      const userId = req.user?.userId;
      const { limit = 10, offset = 0 } = req.query;

      logger.logRequest('GET', '/api/panic-alert/history', {
        userId,
        limit,
        offset
      });

      if (!userId) {
        logger.warn('PANIC', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      const alerts = await databaseService.getPanicAlerts(userId, parseInt(limit), parseInt(offset));

      logger.success('PANIC', 'Retrieved panic alert history', {
        userId,
        count: alerts.length
      });

      res.status(200).json({
        success: true,
        message: 'Panic alert history retrieved',
        data: {
          alerts: alerts.map(alert => ({
            id: alert.id,
            locationData: alert.locationData,
            txHash: alert.txHash,
            blockNumber: alert.blockNumber,
            createdAt: alert.createdAt
          }))
        }
      });

    } catch (error) {
      logger.error('PANIC', 'Get panic history failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to retrieve panic alert history',
        code: 'GET_PANIC_FAILED'
      });
    }
  }
}

module.exports = new PanicController();
