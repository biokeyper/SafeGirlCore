/**
 * Enhanced Encryption Service with Key Rotation Support
 * Allows multiple active master keys during rotation window
 *
 * Usage:
 * 1. During normal operation: One master key (ENCRYPTION_MASTER_KEY)
 * 2. During rotation: Two keys (ENCRYPTION_MASTER_KEY, ENCRYPTION_MASTER_KEY_PREVIOUS)
 * 3. Migration script re-encrypts all data to new key
 * 4. After migration: Clean up old key from production
 *
 * Note: This is an OPTIONAL enhancement. Current single-key approach works fine
 * for MVP. Implement this when ready to rotate keys in production.
 */

import crypto from 'crypto';
import logger from '../utils/logger';

interface EncryptedPayload {
  encryptedData: string;
  reportKey: string;
  iv: string;
  authTag: string;
}

interface EncryptedKey {
  encryptedKey: string;
  keyIv: string;
  keyAuthTag: string;
  keyVersion?: number;  // Which key version was used
}

class EncryptionServiceWithRotation {
  private masterKey: string;
  private previousMasterKey?: string;  // For decryption during rotation window
  private keyVersion: number = 2;      // Current key version (1=original, 2+=rotations)

  constructor() {
    // Current master key (for encryption)
    this.masterKey = process.env.ENCRYPTION_MASTER_KEY || this.generateMasterKey();

    // Previous master key (only available during rotation)
    // Allows decryption of old data while new key is being rolled out
    this.previousMasterKey = process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;

    // Determine current key version from env (optional)
    const envKeyVersion = process.env.ENCRYPTION_KEY_VERSION;
    if (envKeyVersion) {
      this.keyVersion = parseInt(envKeyVersion, 10);
    }

    if (!process.env.ENCRYPTION_MASTER_KEY) {
      logger.warn(
        'ENCRYPTION',
        'Using generated master key - set ENCRYPTION_MASTER_KEY in .env for production'
      );
    }

    if (this.previousMasterKey) {
      logger.info('ENCRYPTION', 'Rotation mode: Multiple keys active', {
        currentVersion: this.keyVersion,
        hasPreviousKey: !!this.previousMasterKey,
      });
    }
  }

  /**
   * Generate a random master key (32 bytes for AES-256)
   */
  private generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Encrypt payload (report data) with per-report key
   * Note: Payload itself is encrypted with per-report key (not master key)
   */
  async encryptPayload(
    payload: Record<string, unknown>,
    reportId: string
  ): Promise<EncryptedPayload> {
    try {
      logger.info('ENCRYPTION', 'Encrypting payload', { reportId });

      const payloadJson = JSON.stringify(payload);
      const reportKey = crypto.randomBytes(32);  // Random key for this report
      const iv = crypto.randomBytes(16);         // Random IV

      const cipher = crypto.createCipheriv('aes-256-gcm', reportKey, iv);
      let encrypted = cipher.update(payloadJson, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag().toString('hex');

      logger.success('ENCRYPTION', 'Payload encrypted successfully', {
        reportId,
        originalSize: payloadJson.length,
        encryptedSize: encrypted.length,
      });

      return {
        encryptedData: encrypted,
        reportKey: reportKey.toString('hex'),
        iv: iv.toString('hex'),
        authTag,
      };
    } catch (error) {
      logger.error('ENCRYPTION', 'Payload encryption failed', {
        reportId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Decrypt payload (report data) with per-report key
   */
  async decryptPayload(
    encryptedData: string,
    reportKey: string,
    iv: string,
    authTag: string,
    reportId: string
  ): Promise<Record<string, unknown>> {
    try {
      const keyBuffer = Buffer.from(reportKey, 'hex');
      const ivBuffer = Buffer.from(iv, 'hex');
      const authTagBuffer = Buffer.from(authTag, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer);
      decipher.setAuthTag(authTagBuffer);

      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const payload = JSON.parse(decrypted) as Record<string, unknown>;

      logger.success('ENCRYPTION', 'Payload decrypted successfully', { reportId });
      return payload;
    } catch (error) {
      logger.error('ENCRYPTION', 'Payload decryption failed', {
        reportId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Encrypt report key with CURRENT master key
   * Always uses this.masterKey (new key after rotation)
   * Includes key version in returned object for database storage
   */
  encryptKey(reportKey: string, reportId: string): EncryptedKey {
    try {
      const masterKeyBuffer = Buffer.from(this.masterKey, 'hex');
      const keyIv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv('aes-256-gcm', masterKeyBuffer, keyIv);
      let encryptedKey = cipher.update(reportKey, 'hex', 'hex');
      encryptedKey += cipher.final('hex');

      const keyAuthTag = cipher.getAuthTag().toString('hex');

      logger.debug('ENCRYPTION', 'Report key encrypted with master key', {
        reportId,
        keyVersion: this.keyVersion,
      });

      return {
        encryptedKey,
        keyIv: keyIv.toString('hex'),
        keyAuthTag,
        keyVersion: this.keyVersion,  // Return key version for database
      };
    } catch (error) {
      logger.error('ENCRYPTION', 'Key encryption failed', {
        reportId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Decrypt report key with correct master key
   * Tries keys in order: specified version first, then previous key as fallback
   *
   * This handles reports encrypted with different key versions:
   * - New reports use current key
   * - Old reports use previous key (during rotation window)
   * - After migration, all reports use current key
   */
  decryptKey(
    encryptedKey: string,
    keyIv: string,
    keyAuthTag: string,
    reportId: string,
    storedKeyVersion: number = 1  // From database key_version column
  ): string {
    try {
      logger.debug('ENCRYPTION', 'Attempting to decrypt report key', {
        reportId,
        storedKeyVersion,
        currentVersion: this.keyVersion,
      });

      // Try with the version that was used to encrypt (from database)
      const keysToTry = [];

      // If stored version matches current, try current first
      if (storedKeyVersion === this.keyVersion) {
        keysToTry.push({
          version: this.keyVersion,
          key: this.masterKey,
          description: 'current key',
        });
      }

      // Try previous key if available (for rotation window)
      if (this.previousMasterKey) {
        keysToTry.push({
          version: this.keyVersion - 1,
          key: this.previousMasterKey,
          description: 'previous key',
        });
      }

      // If neither above, try current key
      if (keysToTry.length === 0) {
        keysToTry.push({
          version: this.keyVersion,
          key: this.masterKey,
          description: 'current key (fallback)',
        });
      }

      // Try each key
      for (const { version, key, description } of keysToTry) {
        try {
          const masterKeyBuffer = Buffer.from(key, 'hex');
          const keyIvBuffer = Buffer.from(keyIv, 'hex');
          const keyAuthTagBuffer = Buffer.from(keyAuthTag, 'hex');

          const decipher = crypto.createDecipheriv('aes-256-gcm', masterKeyBuffer, keyIvBuffer);
          decipher.setAuthTag(keyAuthTagBuffer);

          let reportKey = decipher.update(encryptedKey, 'hex', 'hex');
          reportKey += decipher.final('hex');

          if (version !== storedKeyVersion) {
            logger.warn('ENCRYPTION', 'Decrypted with fallback key', {
              reportId,
              storedKeyVersion,
              usedVersion: version,
              description,
            });
          } else {
            logger.debug('ENCRYPTION', 'Decryption successful', {
              reportId,
              version,
              description,
            });
          }

          return reportKey;
        } catch (error) {
          logger.debug('ENCRYPTION', `Decryption failed with ${description}`, {
            reportId,
            version,
            error: (error as Error).message,
          });
          continue;  // Try next key
        }
      }

      // No key worked
      throw new Error(`Failed to decrypt report key with any available key (stored v${storedKeyVersion})`);
    } catch (error) {
      logger.error('ENCRYPTION', 'Key decryption failed', {
        reportId,
        storedKeyVersion,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get current key version
   * Useful for monitoring and debugging
   */
  getCurrentKeyVersion(): number {
    return this.keyVersion;
  }

  /**
   * Check if multiple keys are active (rotation mode)
   * Returns true during rotation window when both old and new keys are active
   */
  isRotationActive(): boolean {
    return !!this.previousMasterKey;
  }

  /**
   * Hash a PIN for storage
   */
  hashPin(pin: string): string {
    return crypto.createHash('sha256').update(pin).digest('hex');
  }

  /**
   * Verify a PIN against stored hash
   */
  verifyPin(pin: string, hashedPin: string): boolean {
    const hash = crypto.createHash('sha256').update(pin).digest('hex');
    return hash === hashedPin;
  }
}

export default new EncryptionServiceWithRotation();
