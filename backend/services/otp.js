/**
 * OTP Service
 * Handles one-time password generation, storage, and verification
 * SMS via Twilio
 */

const databaseService = require('./database');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Twilio integration
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    logger.success('OTP', 'Twilio client initialized');
  } else {
    logger.warn('OTP', 'Twilio not configured - SMS will be simulated');
  }
} catch (error) {
  logger.error('OTP', 'Failed to initialize Twilio', { error: error.message });
}

class OTPService {
  constructor() {
    this.OTP_LENGTH = 6;
    this.OTP_EXPIRY_MINUTES = 5;
    this.MAX_ATTEMPTS = 3;
  }

  /**
   * Generate a random 6-digit OTP
   * @private
   */
  generateOTPCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Normalize phone number to E.164 format (+COUNTRYCODEXXXXXXXXX)
   * Handles local format (0XXXXXXXXX) and international format
   * Uses COUNTRY_CODE from .env
   * @private
   */
  normalizePhoneNumber(phone) {
    // Remove all non-digit characters
    let normalized = phone.replace(/\D/g, '');

    // If starts with 0 (local format), replace with country code from env
    if (normalized.startsWith('0')) {
      const countryCode = process.env.COUNTRY_CODE || '256'; // Default to Uganda if not set
      normalized = countryCode + normalized.substring(1);
    }

    // Ensure it has the + prefix
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }

    logger.debug('OTP', 'Phone normalized', {
      original: phone,
      normalized,
      countryCode: process.env.COUNTRY_CODE
    });

    return normalized;
  }

  /**
   * Send OTP via SMS using Twilio
   * Falls back to logging in development
   * @private
   */
  async sendOTPViaSMS(phone, otpCode) {
    try {
      // If Twilio is configured, use it
      if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
        try {
          // Normalize phone number to E.164 format for Twilio
          const normalizedPhone = this.normalizePhoneNumber(phone);

          const message = await twilioClient.messages.create({
            body: `Your SafeGirl verification code is: ${otpCode}. Valid for 5 minutes.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: normalizedPhone
          });

          logger.success('OTP', 'SMS sent via Twilio', {
            phone,
            messageId: message.sid
          });

          return true;
        } catch (twilioError) {
          logger.error('OTP', 'Twilio SMS failed', {
            error: twilioError.message,
            phone
          });
          // Don't fallback to mock, let it fail properly
          return false;
        }
      } else {
        // Development mode: just log it
        logger.info('OTP', `[DEV MODE] SMS would be sent to ${phone}`, {
          phone,
          otpCode,
          note: 'Configure Twilio to send real SMS'
        });

        return true;
      }
    } catch (error) {
      logger.error('OTP', 'Failed to send SMS', { error: error.message, phone });
      return false;
    }
  }

  /**
   * Create and send OTP
   * @param {string} phone - Phone number to send OTP to
   * @param {string} otpType - Type of OTP: 'signup', 'login', 'phone_change', 'recovery'
   * @param {string} userId - User ID (optional, NULL for signup)
   */
  async createAndSendOTP(phone, otpType, userId = null) {
    try {
      const otpCode = this.generateOTPCode();
      const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60000);

      logger.info('OTP', `Creating ${otpType} OTP for ${phone}`);

      // Store OTP in database
      const result = await databaseService.query(
        `INSERT INTO otps (userId, phone, otp_code, otp_type, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, otp_code, expires_at`,
        [userId, phone, otpCode, otpType, expiresAt]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to create OTP in database');
      }

      // Send OTP via SMS
      const smsSent = await this.sendOTPViaSMS(phone, otpCode);

      logger.success('OTP', `OTP created and sent for ${otpType}`, {
        phone,
        otpType,
        userId,
        expiresAt
      });

      return {
        success: true,
        otpId: result.rows[0].id,
        expiresAt,
        expiresIn: this.OTP_EXPIRY_MINUTES * 60, // in seconds
        smsSent,
        // For testing only (remove in production)
        _testOTP: process.env.NODE_ENV === 'development' ? otpCode : undefined
      };
    } catch (error) {
      logger.error('OTP', 'Failed to create OTP', {
        error: error.message,
        phone,
        otpType
      });
      throw error;
    }
  }

  /**
   * Verify OTP
   * @param {string} phone - Phone number
   * @param {string} otpCode - OTP code entered by user
   * @param {string} otpType - Type of OTP to verify
   */
  async verifyOTP(phone, otpCode, otpType) {
    try {
      logger.info('OTP', `Verifying ${otpType} OTP for ${phone}`);

      // Find valid OTP
      const result = await databaseService.query(
        `SELECT id, userId, otp_code, attempts, max_attempts, is_used, expires_at
         FROM otps
         WHERE phone = $1
         AND otp_type = $2
         AND is_used = false
         AND attempts < max_attempts
         AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [phone, otpType]
      );

      if (!result.rows || result.rows.length === 0) {
        logger.warn('OTP', `No valid OTP found for ${otpType}`, { phone });
        return {
          success: false,
          message: 'No valid OTP found. Please request a new one.',
          code: 'NO_VALID_OTP'
        };
      }

      const otp = result.rows[0];

      // Check if OTP code matches
      if (otp.otp_code !== otpCode) {
        // Increment attempts
        const newAttempts = otp.attempts + 1;

        if (newAttempts >= otp.max_attempts) {
          // Mark as used (locked)
          await databaseService.query(
            'UPDATE otps SET is_used = true WHERE id = $1',
            [otp.id]
          );

          logger.warn('OTP', `Max attempts reached for ${otpType}`, {
            phone,
            attempts: newAttempts
          });

          return {
            success: false,
            message: 'Too many failed attempts. Please request a new OTP.',
            code: 'MAX_ATTEMPTS',
            attemptsLeft: 0
          };
        }

        // Update attempts
        await databaseService.query(
          'UPDATE otps SET attempts = $1 WHERE id = $2',
          [newAttempts, otp.id]
        );

        logger.warn('OTP', `Invalid OTP code for ${otpType}`, {
          phone,
          attempts: newAttempts,
          maxAttempts: otp.max_attempts
        });

        return {
          success: false,
          message: 'Invalid OTP code',
          code: 'INVALID_OTP',
          attemptsLeft: otp.max_attempts - newAttempts
        };
      }

      // OTP is correct - mark as used and verified
      const verifyResult = await databaseService.query(
        'UPDATE otps SET is_used = true, verified_at = NOW() WHERE id = $1 RETURNING userId',
        [otp.id]
      );

      logger.success('OTP', `OTP verified successfully for ${otpType}`, {
        phone,
        userId: otp.userId
      });

      return {
        success: true,
        userId: otp.userId,
        phone,
        otpType
      };
    } catch (error) {
      logger.error('OTP', 'OTP verification failed', {
        error: error.message,
        phone,
        otpType
      });
      throw error;
    }
  }

  /**
   * Generate recovery token (for email-based recovery)
   */
  async generateRecoveryToken(userId, email, tokenType, newPhone = null) {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60000); // 24 hours

      logger.info('OTP', `Creating ${tokenType} recovery token for ${email}`);

      const result = await databaseService.query(
        `INSERT INTO recovery_tokens (userId, email, token, token_type, new_phone, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING token, expires_at`,
        [userId, email, token, tokenType, newPhone, expiresAt]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to create recovery token');
      }

      logger.success('OTP', `Recovery token created for ${tokenType}`, {
        userId,
        email,
        expiresAt
      });

      return {
        success: true,
        token: result.rows[0].token,
        expiresAt,
        expiresIn: 24 * 60 * 60 // in seconds
      };
    } catch (error) {
      logger.error('OTP', 'Failed to generate recovery token', {
        error: error.message,
        userId,
        email
      });
      throw error;
    }
  }

  /**
   * Verify recovery token
   */
  async verifyRecoveryToken(token) {
    try {
      logger.info('OTP', 'Verifying recovery token');

      const result = await databaseService.query(
        `SELECT userId, email, token_type, new_phone, is_used, expires_at
         FROM recovery_tokens
         WHERE token = $1
         AND is_used = false
         AND expires_at > NOW()`,
        [token]
      );

      if (!result.rows || result.rows.length === 0) {
        logger.warn('OTP', 'Invalid or expired recovery token');
        return {
          success: false,
          message: 'Invalid or expired recovery token',
          code: 'INVALID_TOKEN'
        };
      }

      const recoveryToken = result.rows[0];

      logger.success('OTP', 'Recovery token verified', {
        userId: recoveryToken.userId,
        tokenType: recoveryToken.token_type
      });

      return {
        success: true,
        userId: recoveryToken.userId,
        email: recoveryToken.email,
        tokenType: recoveryToken.token_type,
        newPhone: recoveryToken.new_phone
      };
    } catch (error) {
      logger.error('OTP', 'Recovery token verification failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Mark recovery token as used
   */
  async markRecoveryTokenUsed(token) {
    try {
      await databaseService.query(
        'UPDATE recovery_tokens SET is_used = true, used_at = NOW() WHERE token = $1',
        [token]
      );

      logger.info('OTP', 'Recovery token marked as used');
    } catch (error) {
      logger.error('OTP', 'Failed to mark recovery token as used', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clean up expired OTPs (can be run as cron job)
   */
  async cleanupExpiredOTPs() {
    try {
      const result = await databaseService.query(
        'DELETE FROM otps WHERE expires_at < NOW() RETURNING id'
      );

      logger.info('OTP', 'Cleaned up expired OTPs', {
        count: result.rowCount
      });

      return result.rowCount;
    } catch (error) {
      logger.error('OTP', 'Failed to cleanup expired OTPs', {
        error: error.message
      });
    }
  }

  /**
   * Clean up expired recovery tokens
   */
  async cleanupExpiredTokens() {
    try {
      const result = await databaseService.query(
        'DELETE FROM recovery_tokens WHERE expires_at < NOW() RETURNING id'
      );

      logger.info('OTP', 'Cleaned up expired recovery tokens', {
        count: result.rowCount
      });

      return result.rowCount;
    } catch (error) {
      logger.error('OTP', 'Failed to cleanup expired recovery tokens', {
        error: error.message
      });
    }
  }
}

module.exports = new OTPService();
