/**
 * Encryption Service
 * Handles all encryption/decryption for reports
 * Uses AES-256-GCM for authenticated encryption
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

class EncryptionService {
  constructor() {
    // Master key for encrypting per-report keys (stored in env)
    this.masterKey = process.env.ENCRYPTION_MASTER_KEY || this.generateMasterKey();

    if (!process.env.ENCRYPTION_MASTER_KEY) {
      logger.warn('ENCRYPTION', 'Using generated master key - should set ENCRYPTION_MASTER_KEY in .env');
    }
  }

  /**
   * Generate a random master key (32 bytes for AES-256)
   * @private
   */
  generateMasterKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Encrypt a report payload
   * @param {object} payload - Data to encrypt {responses, metadata, etc}
   * @param {string} reportId - Report ID for logging
   * @returns {Promise<object>} {encryptedData, encryptionKey, iv, authTag}
   */
  async encryptPayload(payload, reportId) {
    try {
      logger.info('ENCRYPTION', 'Encrypting payload', { reportId });

      // Convert payload to JSON string
      const payloadJson = JSON.stringify(payload);

      // Generate random key for this report (32 bytes for AES-256)
      const reportKey = crypto.randomBytes(32);

      // Generate random IV (16 bytes for AES)
      const iv = crypto.randomBytes(16);

      // Create cipher
      const cipher = crypto.createCipheriv('aes-256-gcm', reportKey, iv);

      // Encrypt the payload
      let encrypted = cipher.update(payloadJson, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const authTag = cipher.getAuthTag().toString('hex');

      logger.success('ENCRYPTION', 'Payload encrypted successfully', {
        reportId,
        originalSize: payloadJson.length,
        encryptedSize: encrypted.length
      });

      return {
        encryptedData: encrypted,
        reportKey: reportKey.toString('hex'),
        iv: iv.toString('hex'),
        authTag
      };
    } catch (error) {
      logger.error('ENCRYPTION', 'Encryption failed', {
        reportId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Decrypt a report payload
   * @param {string} encryptedData - Encrypted data (hex)
   * @param {string} reportKey - Report encryption key (hex)
   * @param {string} iv - Initialization vector (hex)
   * @param {string} authTag - Authentication tag (hex)
   * @param {string} reportId - Report ID for logging
   * @returns {Promise<object>} Decrypted payload
   */
  async decryptPayload(encryptedData, reportKey, iv, authTag, reportId) {
    try {
      logger.info('ENCRYPTION', 'Decrypting payload', { reportId });

      // Convert hex strings back to buffers
      const keyBuffer = Buffer.from(reportKey, 'hex');
      const ivBuffer = Buffer.from(iv, 'hex');
      const authTagBuffer = Buffer.from(authTag, 'hex');

      // Create decipher
      const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer);

      // Set authentication tag
      decipher.setAuthTag(authTagBuffer);

      // Decrypt the data
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Parse JSON back to object
      const payload = JSON.parse(decrypted);

      logger.success('ENCRYPTION', 'Payload decrypted successfully', { reportId });

      return payload;
    } catch (error) {
      logger.error('ENCRYPTION', 'Decryption failed', {
        reportId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Encrypt a report key with the master key
   * Used for secure storage in database
   * @param {string} reportKey - Report key (hex)
   * @param {string} reportId - Report ID for logging
   * @returns {object} {encryptedKey, keyIv, keyAuthTag}
   */
  encryptKey(reportKey, reportId) {
    try {
      const masterKeyBuffer = Buffer.from(this.masterKey, 'hex');
      const keyIv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv('aes-256-gcm', masterKeyBuffer, keyIv);

      let encryptedKey = cipher.update(reportKey, 'hex', 'hex');
      encryptedKey += cipher.final('hex');

      const keyAuthTag = cipher.getAuthTag().toString('hex');

      logger.debug('ENCRYPTION', 'Report key encrypted with master key', { reportId });

      return {
        encryptedKey,
        keyIv: keyIv.toString('hex'),
        keyAuthTag
      };
    } catch (error) {
      logger.error('ENCRYPTION', 'Key encryption failed', {
        reportId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Decrypt a report key with the master key
   * @param {string} encryptedKey - Encrypted report key (hex)
   * @param {string} keyIv - IV used for key encryption (hex)
   * @param {string} keyAuthTag - Auth tag for key encryption (hex)
   * @param {string} reportId - Report ID for logging
   * @returns {string} Decrypted report key (hex)
   */
  decryptKey(encryptedKey, keyIv, keyAuthTag, reportId) {
    try {
      const masterKeyBuffer = Buffer.from(this.masterKey, 'hex');
      const keyIvBuffer = Buffer.from(keyIv, 'hex');
      const keyAuthTagBuffer = Buffer.from(keyAuthTag, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', masterKeyBuffer, keyIvBuffer);
      decipher.setAuthTag(keyAuthTagBuffer);

      let reportKey = decipher.update(encryptedKey, 'hex', 'hex');
      reportKey += decipher.final('hex');

      logger.debug('ENCRYPTION', 'Report key decrypted', { reportId });

      return reportKey;
    } catch (error) {
      logger.error('ENCRYPTION', 'Key decryption failed', {
        reportId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Hash a PIN for storage (use argon2 or bcrypt in production)
   * Simple version for now
   * @param {string} pin - User PIN
   * @returns {string} Hashed PIN
   */
  hashPin(pin) {
    return crypto.createHash('sha256').update(pin).digest('hex');
  }

  /**
   * Verify a PIN against stored hash
   * @param {string} pin - User PIN
   * @param {string} hashedPin - Stored PIN hash
   * @returns {boolean} Whether PIN matches
   */
  verifyPin(pin, hashedPin) {
    const hash = crypto.createHash('sha256').update(pin).digest('hex');
    return hash === hashedPin;
  }
}

module.exports = new EncryptionService();
