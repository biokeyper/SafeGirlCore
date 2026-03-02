/**
 * Panic Alert Controller
 * Handles emergency panic alerts and emergency contacts
 */

const blockchainService = require('../services/blockchain');
const databaseService = require('../services/database');
const emailService = require('../services/email');
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

      // Send SMS to emergency contacts in background (non-blocking)
      this.sendEmergencyContactAlerts(userId, locationData).catch(err => {
        logger.error('PANIC', 'Emergency SMS send failed', {
          userId,
          error: err.message
        });
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

  /**
   * Send SMS to emergency contacts (background task)
   * Called asynchronously after panic alert is saved
   */
  async sendEmergencyContactAlerts(userId, locationData) {
    try {
      // Get user's custom panic message
      const userResult = await databaseService.query(
        'SELECT email, customPanicMessage FROM users WHERE userid = $1',
        [userId]
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        logger.warn('PANIC', 'User not found for emergency alerts', { userId });
        return;
      }

      const user = userResult.rows[0];

      // Get active emergency contacts
      const contactsResult = await databaseService.query(
        'SELECT phone, name FROM emergency_contacts WHERE userId = $1 AND isActive = true',
        [userId]
      );

      if (!contactsResult.rows || contactsResult.rows.length === 0) {
        logger.info('PANIC', 'No emergency contacts to notify', { userId });
        return;
      }

      // Build message with custom panic message or default
      const panicMessage = user.customPanicMessage ||
        'Emergency alert from SafeGirl! I need help urgently!';

      const mapLink = `https://maps.google.com/?q=${encodeURIComponent(locationData)}`;
      const fullMessage = `${panicMessage}\n\nLocation: ${mapLink}`;

      // Send SMS to each emergency contact
      const smsResults = [];
      for (let contact of contactsResult.rows) {
        try {
          // Send SMS via email service (Twilio integration)
          const result = await emailService.sendSMS(contact.phone, fullMessage);
          smsResults.push({ phone: contact.phone, sent: true });

          logger.info('PANIC', 'Emergency SMS sent', {
            userId,
            phone: contact.phone,
            name: contact.name
          });

          // Rate limit: 1 second between SMS to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          smsResults.push({ phone: contact.phone, sent: false, error: err.message });
          logger.error('PANIC', 'Emergency SMS failed', {
            userId,
            phone: contact.phone,
            error: err.message
          });
        }
      }

      logger.success('PANIC', 'Emergency contact alerts completed', {
        userId,
        contactsCount: contactsResult.rows.length,
        sentCount: smsResults.filter(r => r.sent).length,
        failedCount: smsResults.filter(r => !r.sent).length
      });

    } catch (error) {
      logger.error('PANIC', 'Send emergency alerts error', {
        error: error.message
      });
    }
  }

  /**
   * Set custom panic message
   * POST /api/emergency/set-panic-message
   */
  async setPanicMessage(req, res, next) {
    try {
      const { message } = req.body;
      const userId = req.user.userId;

      logger.logRequest('POST', '/api/emergency/set-panic-message', { userId });

      // Update user's custom panic message
      const result = await databaseService.query(
        'UPDATE users SET customPanicMessage = $1 WHERE userid = $2 RETURNING customPanicMessage',
        [message, userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to set panic message');
      }

      logger.success('PANIC', 'Custom panic message set', { userId });

      return res.status(200).json({
        success: true,
        message: 'Panic message set successfully',
        data: { panicMessage: result.rows[0].customPanicMessage }
      });

    } catch (error) {
      logger.error('PANIC', 'Set panic message error', { error: error.message });
      next(error);
    }
  }

  /**
   * Get custom panic message
   * GET /api/emergency/panic-message
   */
  async getPanicMessage(req, res, next) {
    try {
      const userId = req.user.userId;

      logger.logRequest('GET', '/api/emergency/panic-message', { userId });

      const result = await databaseService.query(
        'SELECT customPanicMessage FROM users WHERE userid = $1',
        [userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('User not found');
      }

      const panicMessage = result.rows[0].customPanicMessage || null;

      return res.status(200).json({
        success: true,
        data: {
          panicMessage,
          isDefault: !panicMessage,
          defaultMessage: 'Emergency alert from SafeGirl! I need help urgently!'
        }
      });

    } catch (error) {
      logger.error('PANIC', 'Get panic message error', { error: error.message });
      next(error);
    }
  }

  /**
   * Add emergency contact
   * POST /api/emergency/add-contact
   */
  async addEmergencyContact(req, res, next) {
    try {
      const { phone, name, relationship } = req.body;
      const userId = req.user.userId;

      logger.logRequest('POST', '/api/emergency/add-contact', { userId, phone });

      // Check if contact already exists
      const existingResult = await databaseService.query(
        'SELECT id FROM emergency_contacts WHERE userId = $1 AND phone = $2',
        [userId, phone]
      );

      if (existingResult.rows && existingResult.rows.length > 0) {
        logger.warn('PANIC', 'Emergency contact already exists', { userId, phone });
        return res.status(409).json({
          error: true,
          message: 'This contact is already in your emergency list'
        });
      }

      // Add emergency contact
      const result = await databaseService.query(
        `INSERT INTO emergency_contacts (userId, phone, name, relationship, isActive, createdAt, updatedAt)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         RETURNING id, phone, name, relationship, isActive, createdAt`,
        [userId, phone, name || null, relationship || null]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to add emergency contact');
      }

      const contact = result.rows[0];

      logger.success('PANIC', 'Emergency contact added', {
        userId,
        contactId: contact.id,
        phone: contact.phone
      });

      return res.status(201).json({
        success: true,
        message: 'Emergency contact added successfully',
        data: {
          contactId: contact.id,
          phone: contact.phone,
          name: contact.name,
          relationship: contact.relationship,
          isActive: contact.isactive
        }
      });

    } catch (error) {
      logger.error('PANIC', 'Add emergency contact error', { error: error.message });
      next(error);
    }
  }

  /**
   * Remove emergency contact
   * DELETE /api/emergency/remove-contact/:contactId
   */
  async removeEmergencyContact(req, res, next) {
    try {
      const { contactId } = req.params;
      const userId = req.user.userId;

      logger.logRequest('DELETE', '/api/emergency/remove-contact/:contactId', {
        userId,
        contactId
      });

      // Verify contact belongs to user before deleting
      const checkResult = await databaseService.query(
        'SELECT id FROM emergency_contacts WHERE id = $1 AND userId = $2',
        [contactId, userId]
      );

      if (!checkResult.rows || checkResult.rows.length === 0) {
        logger.warn('PANIC', 'Emergency contact not found', { userId, contactId });
        return res.status(404).json({
          error: true,
          message: 'Emergency contact not found'
        });
      }

      // Delete emergency contact
      await databaseService.query(
        'DELETE FROM emergency_contacts WHERE id = $1',
        [contactId]
      );

      logger.success('PANIC', 'Emergency contact removed', { userId, contactId });

      return res.status(200).json({
        success: true,
        message: 'Emergency contact removed successfully'
      });

    } catch (error) {
      logger.error('PANIC', 'Remove emergency contact error', { error: error.message });
      next(error);
    }
  }

  /**
   * Get all emergency contacts for user
   * GET /api/emergency/contacts
   */
  async getEmergencyContacts(req, res, next) {
    try {
      const userId = req.user.userId;

      logger.logRequest('GET', '/api/emergency/contacts', { userId });

      const result = await databaseService.query(
        `SELECT id, phone, name, relationship, isActive, createdAt
         FROM emergency_contacts
         WHERE userId = $1
         ORDER BY createdAt DESC`,
        [userId]
      );

      const contacts = result.rows ? result.rows.map(row => ({
        contactId: row.id,
        phone: row.phone,
        name: row.name,
        relationship: row.relationship,
        isActive: row.isactive,
        createdAt: row.createdat
      })) : [];

      logger.success('PANIC', 'Retrieved emergency contacts', {
        userId,
        count: contacts.length
      });

      return res.status(200).json({
        success: true,
        data: {
          contacts,
          totalCount: contacts.length
        }
      });

    } catch (error) {
      logger.error('PANIC', 'Get emergency contacts error', { error: error.message });
      next(error);
    }
  }
}

module.exports = new PanicController();
