/**
 * Key Recovery Controller
 * Handles encryption key backup and recovery
 */

const encryptionService = require('../services/encryption');
const databaseService = require('../services/database');
const logger = require('../utils/logger');

class KeyRecoveryController {

  /**
   * Backup encryption key with PIN
   * POST /api/keys/backup
   *
   * Body:
   * {
   *   "pin": "user's 4-digit PIN",
   *   "encryptionKey": "hex-encoded report key to backup"
   * }
   */
  async backupKeyWithPin(req, res, next) {
    try {
      const { pin, encryptionKey } = req.body;
      const userId = req.user?.userId;

      logger.logRequest('POST', '/api/keys/backup', {
        userId,
        hasPin: !!pin,
        hasKey: !!encryptionKey
      });

      if (!userId) {
        logger.warn('KEY_RECOVERY', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Validate PIN
      if (!pin || typeof pin !== 'string') {
        logger.warn('KEY_RECOVERY', 'Missing or invalid PIN', { userId });
        return res.status(400).json({
          error: true,
          message: 'pin is required (string)'
        });
      }

      if (!/^\d{4,6}$/.test(pin)) {
        logger.warn('KEY_RECOVERY', 'PIN must be 4-6 digits', { userId });
        return res.status(400).json({
          error: true,
          message: 'PIN must be 4-6 digits'
        });
      }

      // Validate encryption key
      if (!encryptionKey || typeof encryptionKey !== 'string') {
        logger.warn('KEY_RECOVERY', 'Missing or invalid encryption key', { userId });
        return res.status(400).json({
          error: true,
          message: 'encryptionKey is required (hex string)'
        });
      }

      logger.info('KEY_RECOVERY', 'Processing key backup', { userId });

      // Hash the PIN for storage
      const pinHash = encryptionService.hashPin(pin);

      // Encrypt the key with PIN (derive encryption key from PIN)
      // In production, use proper key derivation (PBKDF2, Argon2)
      const keyEncryption = this.encryptKeyWithPin(encryptionKey, pin);

      // Save to database
      const backup = await databaseService.saveKeyBackup({
        userId,
        encryptedKey: keyEncryption.encryptedKey,
        keyIv: keyEncryption.keyIv,
        keyAuthTag: keyEncryption.keyAuthTag,
        pinHash
      });

      logger.success('KEY_RECOVERY', 'Key backup saved', {
        userId,
        backupId: backup.id
      });

      res.status(200).json({
        success: true,
        message: 'Encryption key backed up successfully with PIN',
        data: {
          backupId: backup.id,
          backupCreatedAt: backup.backupCreatedAt,
          reminder: 'Save your PIN in a safe place. You will need it to recover your key if you lose your phone.'
        }
      });

    } catch (error) {
      logger.error('KEY_RECOVERY', 'Key backup failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to backup encryption key',
        code: 'BACKUP_KEY_FAILED'
      });
    }
  }

  /**
   * Recover encryption key using PIN
   * POST /api/keys/recover
   *
   * Body:
   * {
   *   "phone": "user's phone number",
   *   "pin": "user's 4-digit PIN"
   * }
   */
  async recoverKeyWithPin(req, res, next) {
    try {
      const { phone, pin } = req.body;

      logger.logRequest('POST', '/api/keys/recover', {
        phone: !!phone,
        hasPin: !!pin
      });

      // Get user by phone
      if (!phone || typeof phone !== 'string') {
        logger.warn('KEY_RECOVERY', 'Missing or invalid phone', {});
        return res.status(400).json({
          error: true,
          message: 'phone is required'
        });
      }

      // Validate PIN
      if (!pin || typeof pin !== 'string') {
        logger.warn('KEY_RECOVERY', 'Missing or invalid PIN', {});
        return res.status(400).json({
          error: true,
          message: 'pin is required'
        });
      }

      // Lookup user by phone
      const userResult = await databaseService.query(
        'SELECT userId FROM users WHERE phone = $1',
        [phone]
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        logger.warn('KEY_RECOVERY', 'User not found', { phone });
        return res.status(404).json({
          error: true,
          message: 'User not found'
        });
      }

      const userId = userResult.rows[0].userid;

      // Get key backup
      const backup = await databaseService.getKeyBackup(userId);

      if (!backup) {
        logger.warn('KEY_RECOVERY', 'No key backup found', { userId });
        return res.status(404).json({
          error: true,
          message: 'No key backup found for this account. Please set up backup first.'
        });
      }

      // Check recovery attempts (max 3 attempts per hour)
      if (backup.recoveryAttempts >= 3) {
        const lastAttempt = new Date(backup.lastRecoveryAttempt);
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

        if (lastAttempt > hourAgo) {
          logger.warn('KEY_RECOVERY', 'Too many recovery attempts', { userId });
          return res.status(429).json({
            error: true,
            message: 'Too many recovery attempts. Try again later.',
            code: 'RECOVERY_RATE_LIMITED'
          });
        }
      }

      // Verify PIN
      const pinHash = encryptionService.hashPin(pin);
      if (pinHash !== backup.pinHash) {
        logger.warn('KEY_RECOVERY', 'Invalid PIN', { userId });

        // Record failed attempt
        await databaseService.incrementRecoveryAttempts(userId);

        return res.status(401).json({
          error: true,
          message: 'Invalid PIN',
          code: 'INVALID_PIN'
        });
      }

      // Decrypt the key with PIN
      const reportKey = this.decryptKeyWithPin(
        backup.encryptedKey,
        backup.keyIv,
        backup.keyAuthTag,
        pin
      );

      logger.success('KEY_RECOVERY', 'Key recovered successfully', { userId });

      res.status(200).json({
        success: true,
        message: 'Encryption key recovered successfully',
        data: {
          encryptionKey: reportKey,
          reminder: 'Use this key to decrypt your reports. Keep it safe.'
        }
      });

    } catch (error) {
      logger.error('KEY_RECOVERY', 'Key recovery failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to recover encryption key',
        code: 'RECOVER_KEY_FAILED'
      });
    }
  }

  /**
   * Encrypt key using PIN
   * Simple version - in production use proper key derivation
   * @private
   */
  encryptKeyWithPin(reportKey, pin) {
    const crypto = require('crypto');

    // Derive encryption key from PIN (simple version)
    // Production: Use PBKDF2 or Argon2
    const pinBuffer = Buffer.from(pin, 'utf8');
    const derivedKey = crypto.createHash('sha256').update(pinBuffer).digest();

    // Generate random IV
    const iv = crypto.randomBytes(16);

    // Create cipher with derived key
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);

    let encrypted = cipher.update(reportKey, 'hex', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encryptedKey: encrypted,
      keyIv: iv.toString('hex'),
      keyAuthTag: authTag
    };
  }

  /**
   * Decrypt key using PIN
   * @private
   */
  decryptKeyWithPin(encryptedKey, keyIv, keyAuthTag, pin) {
    const crypto = require('crypto');

    // Derive encryption key from PIN (same method as encryption)
    const pinBuffer = Buffer.from(pin, 'utf8');
    const derivedKey = crypto.createHash('sha256').update(pinBuffer).digest();

    const ivBuffer = Buffer.from(keyIv, 'hex');
    const authTagBuffer = Buffer.from(keyAuthTag, 'hex');

    // Create decipher with derived key
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, ivBuffer);
    decipher.setAuthTag(authTagBuffer);

    let decrypted = decipher.update(encryptedKey, 'hex', 'hex');
    decrypted += decipher.final('hex');

    return decrypted;
  }
}

module.exports = new KeyRecoveryController();
