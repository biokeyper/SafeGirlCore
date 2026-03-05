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
   * Normalize phone number to E.164 format (+COUNTRYCODEXXXXXXXXX)
   * Removes spaces, dashes, and other non-digits
   * Converts local format (0XXXXXXXXX) to international
   * @private
   */
  normalizePhoneNumber(phone) {
    if (!phone) return null;

    // Remove all non-digit characters (spaces, dashes, etc.)
    let normalized = phone.replace(/\D/g, '');

    // If starts with 0 (local format), replace with country code from env
    if (normalized.startsWith('0')) {
      const countryCode = process.env.COUNTRY_CODE || '256'; // Default to Uganda
      normalized = countryCode + normalized.substring(1);
    }

    // Ensure it has the + prefix for E.164 format
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }

    logger.debug('PANIC', 'Phone normalized', {
      original: phone,
      normalized
    });

    return normalized;
  }

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
    let alertId = null;

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

      logger.info('PANIC', 'Processing panic alert (NON-BLOCKING)', {
        userId,
        locationLength: locationData.length
      });

      // ========== STEP 1: Save to database immediately (fast) ==========
      const walletAddress = blockchainService.getWalletAddress();

      const alertRecord = await databaseService.savePanicAlert({
        userId,
        walletAddress,
        locationData,
        txHash: null,  // Will be updated after blockchain confirmation
        blockNumber: null
      });

      alertId = alertRecord.id;

      logger.success('PANIC', 'Panic alert saved to database immediately', {
        userId,
        alertId,
        status: 'pending'
      });

      // ========== STEP 1.5: Create notification for user ==========
      await databaseService.createNotification({
        userId,
        type: 'panic_alert',
        title: 'Panic Alert Sent',
        message: 'Your emergency panic alert has been sent. Emergency contacts are being notified.',
        relatedId: alertId.toString()
      });

      logger.success('PANIC', 'Notification created for panic alert', {
        userId,
        alertId
      });

      // ========== STEP 2: Return 200 OK immediately to user ==========
      res.status(200).json({
        success: true,
        message: 'Panic alert received. Help is being sent.',
        data: {
          alertId: alertRecord.id,
          status: 'pending',
          timestamp: new Date().toISOString()
        }
      });

      // ========== STEP 3: Process blockchain + SMS in background (non-blocking) ==========
      this.processPanicAlertBackground(userId, locationData, alertId).catch(err => {
        logger.error('PANIC', 'Background processing failed', {
          userId,
          alertId,
          error: err.message
        });
      });

    } catch (error) {
      logger.error('PANIC', 'Panic alert creation failed', {
        alertId,
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to create panic alert',
        code: 'PANIC_CREATION_FAILED'
      });
    }
  }

  /**
   * Process panic alert in background
   * PRIORITY ORDER:
   * 1. Send SMS to emergency contacts (CRITICAL - fastest)
   * 2. Send to blockchain (audit trail - can fail without affecting SMS)
   * Both run in parallel, not sequential
   */
  async processPanicAlertBackground(userId, locationData, alertId) {
    try {
      logger.info('PANIC', 'Background processing started', { userId, alertId });

      // ========== PRIORITY 1: Send SMS immediately (independent of blockchain) ==========
      // Start SMS immediately - don't wait for blockchain
      const smsPromise = this.sendEmergencyContactAlerts(userId, locationData)
        .then(() => {
          logger.success('PANIC', 'Emergency SMS alerts sent', {
            userId,
            alertId
          });
        })
        .catch(err => {
          logger.error('PANIC', 'SMS sending failed', {
            userId,
            alertId,
            error: err.message
          });
        });

      // ========== PRIORITY 2: Send to blockchain (parallel, non-blocking) ==========
      // Blockchain runs in parallel, doesn't block SMS
      const blockchainPromise = blockchainService.sendPanicAlert(locationData)
        .then(tx => {
          logger.success('PANIC', 'Panic alert sent to blockchain', {
            userId,
            alertId,
            txHash: tx.txHash,
            blockNumber: tx.blockNumber
          });

          // Update DB with blockchain info
          return databaseService.updatePanicAlert(alertId, {
            txHash: tx.txHash,
            blockNumber: tx.blockNumber,
            status: 'confirmed'
          });
        })
        .then(() => {
          logger.success('PANIC', 'Panic alert updated with blockchain tx', {
            userId,
            alertId
          });
        })
        .catch(err => {
          logger.error('PANIC', 'Blockchain processing failed', {
            userId,
            alertId,
            error: err.message
          });
          // Note: SMS was already sent even if blockchain fails
        });

      // Wait for both to complete, but don't fail if either fails
      await Promise.allSettled([smsPromise, blockchainPromise]);

      logger.success('PANIC', 'Background processing completed', {
        userId,
        alertId
      });

    } catch (error) {
      logger.error('PANIC', 'Background processing error', {
        userId,
        alertId,
        error: error.message
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
        'SELECT email, custompanicmessage FROM users WHERE userid = $1',
        [userId]
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        logger.warn('PANIC', 'User not found for emergency alerts', { userId });
        return;
      }

      const user = userResult.rows[0];

      // Get active emergency contacts
      const contactsResult = await databaseService.query(
        'SELECT phone, name FROM emergency_contacts WHERE userid = $1 AND isactive = true',
        [userId]
      );

      if (!contactsResult.rows || contactsResult.rows.length === 0) {
        logger.info('PANIC', 'No emergency contacts to notify', { userId });
        return;
      }

      // Build message with custom panic message or default
      const panicMessage = user.custompanicmessage ||
        'Emergency alert from SafeGirl! I need help urgently!';

      const mapLink = `https://maps.google.com/?q=${encodeURIComponent(locationData)}`;
      const fullMessage = `${panicMessage}\n\nLocation: ${mapLink}`;

      // Send SMS to each emergency contact
      const smsResults = [];
      for (let contact of contactsResult.rows) {
        try {
          // Normalize phone before sending (defensive - remove spaces, format correctly)
          const normalizedPhone = this.normalizePhoneNumber(contact.phone);

          if (!normalizedPhone) {
            logger.warn('PANIC', 'Invalid phone number, skipping', {
              userId,
              phone: contact.phone
            });
            smsResults.push({ phone: contact.phone, sent: false, error: 'Invalid phone number' });
            continue;
          }

          // Send SMS via email service (Twilio integration)
          const result = await emailService.sendSMS(normalizedPhone, fullMessage);
          smsResults.push({ phone: normalizedPhone, sent: true });

          logger.info('PANIC', 'Emergency SMS sent', {
            userId,
            phone: normalizedPhone,
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
        'UPDATE users SET custompanicmessage = $1 WHERE userid = $2 RETURNING custompanicmessage',
        [message, userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to set panic message');
      }

      logger.success('PANIC', 'Custom panic message set', { userId });

      return res.status(200).json({
        success: true,
        message: 'Panic message set successfully',
        data: { panicMessage: result.rows[0].custompanicmessage }
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
        'SELECT custompanicmessage FROM users WHERE userid = $1',
        [userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('User not found');
      }

      const panicMessage = result.rows[0].custompanicmessage || null;

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

      // Normalize phone number (remove spaces, dashes, etc.)
      const normalizedPhone = this.normalizePhoneNumber(phone);

      if (!normalizedPhone) {
        logger.warn('PANIC', 'Invalid phone number', { userId, phone });
        return res.status(400).json({
          error: true,
          message: 'Invalid phone number'
        });
      }

      // Check if contact already exists (by normalized phone)
      const existingResult = await databaseService.query(
        'SELECT id FROM emergency_contacts WHERE userid = $1 AND phone = $2',
        [userId, normalizedPhone]
      );

      if (existingResult.rows && existingResult.rows.length > 0) {
        logger.warn('PANIC', 'Emergency contact already exists', { userId, phone: normalizedPhone });
        return res.status(409).json({
          error: true,
          message: 'This contact is already in your emergency list'
        });
      }

      // Add emergency contact with normalized phone
      const result = await databaseService.query(
        `INSERT INTO emergency_contacts (userid, phone, name, relationship, isactive, createdat, updatedat)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         RETURNING id, phone, name, relationship, isactive, createdat`,
        [userId, normalizedPhone, name || null, relationship || null]
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
        'SELECT id FROM emergency_contacts WHERE id = $1 AND userid = $2',
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
   * Edit emergency contact details
   * PUT /api/emergency/edit-contact/:contactId
   */
  async editEmergencyContact(req, res, next) {
    try {
      const { contactId } = req.params;
      const { phone, name, relationship } = req.body;
      const userId = req.user.userId;

      logger.logRequest('PUT', '/api/emergency/edit-contact/:contactId', {
        userId,
        contactId
      });

      // Verify contact belongs to user before editing
      const checkResult = await databaseService.query(
        'SELECT id, phone FROM emergency_contacts WHERE id = $1 AND userid = $2',
        [contactId, userId]
      );

      if (!checkResult.rows || checkResult.rows.length === 0) {
        logger.warn('PANIC', 'Emergency contact not found', { userId, contactId });
        return res.status(404).json({
          error: true,
          message: 'Emergency contact not found'
        });
      }

      const oldPhone = checkResult.rows[0].phone;

      // Normalize phone if provided
      let normalizedPhone = oldPhone;
      if (phone) {
        normalizedPhone = this.normalizePhoneNumber(phone);

        if (!normalizedPhone) {
          logger.warn('PANIC', 'Invalid phone number', { userId, phone });
          return res.status(400).json({
            error: true,
            message: 'Invalid phone number'
          });
        }

        // Check if new phone already exists for this user (but different contact)
        if (normalizedPhone !== oldPhone) {
          const existingResult = await databaseService.query(
            'SELECT id FROM emergency_contacts WHERE userid = $1 AND phone = $2 AND id != $3',
            [userId, normalizedPhone, contactId]
          );

          if (existingResult.rows && existingResult.rows.length > 0) {
            logger.warn('PANIC', 'Phone already exists for another contact', { userId, phone: normalizedPhone });
            return res.status(409).json({
              error: true,
              message: 'This phone number is already in your emergency list'
            });
          }
        }
      }

      // Update emergency contact
      const result = await databaseService.query(
        `UPDATE emergency_contacts
         SET phone = $1, name = $2, relationship = $3, updatedat = NOW()
         WHERE id = $4 AND userid = $5
         RETURNING id, phone, name, relationship, isactive, createdat, updatedat`,
        [normalizedPhone, name || null, relationship || null, contactId, userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to update emergency contact');
      }

      const contact = result.rows[0];

      logger.success('PANIC', 'Emergency contact updated', {
        userId,
        contactId,
        phone: contact.phone
      });

      return res.status(200).json({
        success: true,
        message: 'Emergency contact updated successfully',
        data: {
          contactId: contact.id,
          phone: contact.phone,
          name: contact.name,
          relationship: contact.relationship,
          isActive: contact.isactive,
          createdAt: contact.createdat,
          updatedAt: contact.updatedat
        }
      });

    } catch (error) {
      logger.error('PANIC', 'Edit emergency contact error', { error: error.message });
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
        `SELECT id, phone, name, relationship, isactive, createdat
         FROM emergency_contacts
         WHERE userid = $1
         ORDER BY createdat DESC`,
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
