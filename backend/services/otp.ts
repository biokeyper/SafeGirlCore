/**
 * OTP Service
 * Handles one-time password generation, storage, and verification
 * SMS via Twilio
 */

import databaseService from "./database";
import logger from "../utils/logger";
import crypto from "crypto";
import twilio from "twilio";

// Twilio integration
let twilioClient: ReturnType<typeof twilio> | null = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    logger.success("OTP", "Twilio client initialized");
  } else {
    logger.warn("OTP", "Twilio not configured - SMS will be simulated");
  }
} catch (error) {
  logger.error("OTP", "Failed to initialize Twilio", {
    error: error instanceof Error ? error.message : String(error),
  });
}

interface OTPResult {
  success: boolean;
  otpId?: number;
  expiresAt?: Date;
  expiresIn?: number;
  smsSent?: boolean;
  _testOTP?: string;
}

interface VerifyOTPResult {
  success: boolean;
  message?: string;
  code?: string;
  userid?: number;
  phone?: string;
  otpType?: string;
  attemptsLeft?: number;
}

interface RecoveryTokenResult {
  success: boolean;
  token?: string;
  expiresAt?: Date;
  expiresIn?: number;
  message?: string;
  code?: string;
  userId?: number;
  email?: string;
  tokenType?: string;
  newPhone?: string;
}

class OTPService {
  private OTP_LENGTH: number;
  private OTP_EXPIRY_MINUTES: number;
  private MAX_ATTEMPTS: number;
  private MAX_FAILED_OTP_ATTEMPTS: number;
  private LOCKOUT_DURATION_MS: number;

  constructor() {
    this.OTP_LENGTH = 6;
    this.OTP_EXPIRY_MINUTES = 5;
    this.MAX_ATTEMPTS = 3; // Max attempts per OTP code
    this.MAX_FAILED_OTP_ATTEMPTS = 3; // Max failed attempts before account lockout
    this.LOCKOUT_DURATION_MS = 60 * 60 * 1000; // Default (not used, escalating instead)
  }

  /**
   * Get escalating lockout duration based on number of previous lockouts
   * 1st lockout: 5 minutes
   * 2nd lockout: 10 minutes
   * 3rd lockout: 1 hour
   * 4th+ lockout: 2 hours
   * @private
   */
  private getEscalatingLockoutDuration(lockoutCount: number): number {
    const durations = [
      5 * 60 * 1000,      // 5 minutes
      10 * 60 * 1000,     // 10 minutes
      60 * 60 * 1000,     // 1 hour
      2 * 60 * 60 * 1000, // 2 hours
    ];

    // Cap at 2 hours (index 3)
    const durationMs = durations[Math.min(lockoutCount, 3)];

    logger.debug("OTP", "Escalating lockout duration", {
      lockoutCount,
      durationMinutes: durationMs / (60 * 1000),
    });

    return durationMs;
  }

  /**
   * Generate a random 6-digit OTP
   * @private
   */
  private generateOTPCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Normalize phone number to E.164 format (+COUNTRYCODEXXXXXXXXX)
   * Handles local format (0XXXXXXXXX) and international format
   * Uses COUNTRY_CODE from .env
   * @private
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters
    let normalized = phone.replace(/\D/g, "");

    // If starts with 0 (local format), replace with country code from env
    if (normalized.startsWith("0")) {
      const countryCode = process.env.COUNTRY_CODE || "256"; // Default to Uganda if not set
      normalized = countryCode + normalized.substring(1);
    }

    // Ensure it has the + prefix
    if (!normalized.startsWith("+")) {
      normalized = "+" + normalized;
    }

    logger.debug("OTP", "Phone normalized", {
      original: phone,
      normalized,
      countryCode: process.env.COUNTRY_CODE,
    });

    return normalized;
  }

  /**
   * Check if account is locked due to too many failed OTP attempts
   * @private
   */
  private async isAccountLocked(phone: string): Promise<{ locked: boolean; unlocksAt?: Date }> {
    try {
      const result = await databaseService.query(
        "SELECT otp_lockout_until FROM users WHERE phone = $1",
        [phone]
      );

      if (!result.rows || result.rows.length === 0) {
        return { locked: false };
      }

      const lockoutUntil = result.rows[0].otp_lockout_until;

      // Check if lockout has expired
      if (lockoutUntil && new Date(lockoutUntil) > new Date()) {
        return {
          locked: true,
          unlocksAt: new Date(lockoutUntil),
        };
      }

      return { locked: false };
    } catch (error) {
      logger.error("OTP", "Failed to check account lockout", {
        error: error instanceof Error ? error.message : String(error),
        phone,
      });
      throw error;
    }
  }

  /**
   * Increment failed OTP attempts and lock account if threshold reached
   * Uses escalating lockout durations: 5min → 10min → 1hr → 2hrs
   * @private
   */
  private async incrementFailedAttempts(phone: string): Promise<void> {
    try {
      const result = await databaseService.query(
        "SELECT otp_failed_attempts, otp_lockout_count FROM users WHERE phone = $1",
        [phone]
      );

      if (!result.rows || result.rows.length === 0) {
        return; // User doesn't exist yet (signup flow)
      }

      const currentAttempts = result.rows[0].otp_failed_attempts || 0;
      const currentLockoutCount = result.rows[0].otp_lockout_count || 0;
      const newAttempts = currentAttempts + 1;

      if (newAttempts >= this.MAX_FAILED_OTP_ATTEMPTS) {
        // Lock the account with escalating duration
        const escalatedLockoutDurationMs = this.getEscalatingLockoutDuration(
          currentLockoutCount
        );
        const lockoutUntil = new Date(Date.now() + escalatedLockoutDurationMs);
        const newLockoutCount = currentLockoutCount + 1;

        await databaseService.query(
          `UPDATE users
           SET otp_failed_attempts = $1,
               otp_lockout_until = $2,
               otp_lockout_count = $3
           WHERE phone = $4`,
          [newAttempts, lockoutUntil, newLockoutCount, phone]
        );

        const lockoutMinutes = Math.round(escalatedLockoutDurationMs / (60 * 1000));

        logger.warn("OTP", "Account locked due to too many failed OTP attempts", {
          phone,
          attempts: newAttempts,
          lockoutNumber: newLockoutCount,
          lockoutMinutes,
          unlocksAt: lockoutUntil,
        });
      } else {
        // Just increment the counter
        await databaseService.query(
          "UPDATE users SET otp_failed_attempts = $1 WHERE phone = $2",
          [newAttempts, phone]
        );
      }
    } catch (error) {
      logger.error("OTP", "Failed to increment failed attempts", {
        error: error instanceof Error ? error.message : String(error),
        phone,
      });
      // Don't throw - don't block OTP verification if lockout tracking fails
    }
  }

  /**
   * Reset failed OTP attempts after successful verification
   * Also resets escalating lockout count so next lockout starts fresh
   * @private
   */
  private async resetFailedAttempts(phone: string): Promise<void> {
    try {
      await databaseService.query(
        `UPDATE users
         SET otp_failed_attempts = 0,
             otp_lockout_until = NULL,
             otp_lockout_count = 0
         WHERE phone = $1`,
        [phone]
      );

      logger.info("OTP", "Failed OTP attempts and lockout count reset", { phone });
    } catch (error) {
      logger.error("OTP", "Failed to reset failed attempts", {
        error: error instanceof Error ? error.message : String(error),
        phone,
      });
      // Don't throw - don't block OTP verification if reset fails
    }
  }

  /**
   * Send OTP via SMS using Twilio
   * Falls back to logging in development
   * @private
   */
  private async sendOTPViaSMS(phone: string, otpCode: string): Promise<boolean> {
    try {
      // If Twilio is configured, use it
      if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
        try {
          // Normalize phone number to E.164 format for Twilio
          const normalizedPhone = this.normalizePhoneNumber(phone);

          const message = await twilioClient.messages.create({
            body: `Your SafeGirl verification code is: ${otpCode}. Valid for 5 minutes.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: normalizedPhone,
          });

          logger.success("OTP", "SMS sent via Twilio", {
            phone,
            messageId: message.sid,
          });

          return true;
        } catch (twilioError) {
          logger.error("OTP", "Twilio SMS failed", {
            error: twilioError instanceof Error ? twilioError.message : String(twilioError),
            phone,
          });
          // Don't fallback to mock, let it fail properly
          return false;
        }
      } else {
        // Development mode: just log it
        logger.info("OTP", `[DEV MODE] SMS would be sent to ${phone}`, {
          phone,
          otpCode,
          note: "Configure Twilio to send real SMS",
        });

        return true;
      }
    } catch (error) {
      logger.error("OTP", "Failed to send SMS", {
        error: error instanceof Error ? error.message : String(error),
        phone,
      });
      return false;
    }
  }

  /**
   * Create and send OTP
   * @param {string} phone - Phone number to send OTP to
   * @param {string} otpType - Type of OTP: 'signup', 'login', 'phone_change', 'recovery'
   * @param {string} userId - User ID (optional, NULL for signup)
   */
  async createAndSendOTP(
    phone: string,
    otpType: string,
    userId: number | null = null
  ): Promise<OTPResult> {
    try {
      const otpCode = this.generateOTPCode();
      const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60000);

      logger.info("OTP", `Creating ${otpType} OTP for ${phone}`);

      // Expose OTP in logs only for development and testing workflows.
      logger.success("OTP", `Generated OTP Code: ${otpCode}`, {
        phone,
        otpType,
        expiresInMinutes: this.OTP_EXPIRY_MINUTES,
        note: "Use this code to complete signup/login",
      });

      // Store OTP in database
      const result = await databaseService.query(
        `INSERT INTO otps (userId, phone, otp_code, otp_type, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, otp_code, expires_at`,
        [userId, phone, otpCode, otpType, expiresAt]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error("Failed to create OTP in database");
      }

      // Send OTP via SMS
      const smsSent = await this.sendOTPViaSMS(phone, otpCode);

      logger.success("OTP", `OTP created and sent for ${otpType}`, {
        phone,
        otpType,
        userId,
        expiresAt,
      });

      return {
        success: true,
        otpId: result.rows[0].id,
        expiresAt,
        expiresIn: this.OTP_EXPIRY_MINUTES * 60, // in seconds
        smsSent,
        // Returned only in development mode.
        _testOTP: process.env.NODE_ENV === "development" ? otpCode : undefined,
      };
    } catch (error) {
      logger.error("OTP", "Failed to create OTP", {
        error: error instanceof Error ? error.message : String(error),
        phone,
        otpType,
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
  async verifyOTP(
    phone: string,
    otpCode: string,
    otpType: string
  ): Promise<VerifyOTPResult> {
    try {
      logger.info("OTP", `Verifying ${otpType} OTP for ${phone}`);

      // Check if account is locked
      const lockoutStatus = await this.isAccountLocked(phone);
      if (lockoutStatus.locked) {
        logger.warn("OTP", "Account is locked due to too many failed attempts", {
          phone,
          unlocksAt: lockoutStatus.unlocksAt,
        });

        return {
          success: false,
          message: `Account locked. Try again in 1 hour.`,
          code: "ACCOUNT_LOCKED",
        };
      }

      // Find valid OTP
      const result = await databaseService.query(
        `SELECT id, userid, otp_code, attempts, max_attempts, is_used, expires_at
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
        logger.warn("OTP", `No valid OTP found for ${otpType}`, { phone });
        return {
          success: false,
          message: "No valid OTP found. Please request a new one.",
          code: "NO_VALID_OTP",
        };
      }

      const otp = result.rows[0];

      // Check if OTP code matches
      if (otp.otp_code !== otpCode) {
        // Increment OTP-level attempts (per code)
        const newAttempts = otp.attempts + 1;

        if (newAttempts >= otp.max_attempts) {
          // Mark as used (locked)
          await databaseService.query(
            "UPDATE otps SET is_used = true WHERE id = $1",
            [otp.id]
          );

          logger.warn("OTP", `Max attempts reached for ${otpType}`, {
            phone,
            attempts: newAttempts,
          });

          // Also increment account-level failed attempts
          await this.incrementFailedAttempts(phone);

          return {
            success: false,
            message: "Too many failed attempts. Please request a new OTP.",
            code: "MAX_ATTEMPTS",
            attemptsLeft: 0,
          };
        }

        // Update OTP-level attempts
        await databaseService.query(
          "UPDATE otps SET attempts = $1 WHERE id = $2",
          [newAttempts, otp.id]
        );

        // Also increment account-level failed attempts
        await this.incrementFailedAttempts(phone);

        logger.warn("OTP", `Invalid OTP code for ${otpType}`, {
          phone,
          attempts: newAttempts,
          maxAttempts: otp.max_attempts,
        });

        return {
          success: false,
          message: "Invalid OTP code",
          code: "INVALID_OTP",
          attemptsLeft: otp.max_attempts - newAttempts,
        };
      }

      // OTP is correct - mark as used and verified
      await databaseService.query(
        "UPDATE otps SET is_used = true, verified_at = NOW() WHERE id = $1",
        [otp.id]
      );

      // Reset failed attempts on successful verification
      await this.resetFailedAttempts(phone);

      logger.success("OTP", `OTP verified successfully for ${otpType}`, {
        phone,
        userid: otp.userid,
      });

      return {
        success: true,
        userid: otp.userid,
        phone,
        otpType,
      };
    } catch (error) {
      logger.error("OTP", "OTP verification failed", {
        error: error instanceof Error ? error.message : String(error),
        phone,
        otpType,
      });
      throw error;
    }
  }

  /**
   * Generate recovery token (for email-based recovery)
   */
  async generateRecoveryToken(
    userId: number,
    email: string,
    tokenType: string,
    newPhone: string | null = null
  ): Promise<RecoveryTokenResult> {
    try {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60000); // 24 hours

      logger.info("OTP", `Creating ${tokenType} recovery token for ${email}`);

      const result = await databaseService.query(
        `INSERT INTO recovery_tokens (userId, email, token, token_type, new_phone, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING token, expires_at`,
        [userId, email, token, tokenType, newPhone, expiresAt]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error("Failed to create recovery token");
      }

      logger.success("OTP", `Recovery token created for ${tokenType}`, {
        userId,
        email,
        expiresAt,
      });

      return {
        success: true,
        token: result.rows[0].token,
        expiresAt,
        expiresIn: 24 * 60 * 60, // in seconds
      };
    } catch (error) {
      logger.error("OTP", "Failed to generate recovery token", {
        error: error instanceof Error ? error.message : String(error),
        userId,
        email,
      });
      throw error;
    }
  }

  /**
   * Verify recovery token
   */
  async verifyRecoveryToken(token: string): Promise<RecoveryTokenResult> {
    try {
      logger.info("OTP", "Verifying recovery token");

      const result = await databaseService.query(
        `SELECT userId, email, token_type, new_phone, is_used, expires_at
         FROM recovery_tokens
         WHERE token = $1
         AND is_used = false
         AND expires_at > NOW()`,
        [token]
      );

      if (!result.rows || result.rows.length === 0) {
        logger.warn("OTP", "Invalid or expired recovery token");
        return {
          success: false,
          message: "Invalid or expired recovery token",
          code: "INVALID_TOKEN",
        };
      }

      const recoveryToken = result.rows[0];

      logger.success("OTP", "Recovery token verified", {
        userId: recoveryToken.userid,
        tokenType: recoveryToken.token_type,
      });

      return {
        success: true,
        userId: recoveryToken.userid,
        email: recoveryToken.email,
        tokenType: recoveryToken.token_type,
        newPhone: recoveryToken.new_phone,
      };
    } catch (error) {
      logger.error("OTP", "Recovery token verification failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mark recovery token as used
   */
  async markRecoveryTokenUsed(token: string): Promise<void> {
    try {
      await databaseService.query(
        "UPDATE recovery_tokens SET is_used = true, used_at = NOW() WHERE token = $1",
        [token]
      );

      logger.info("OTP", "Recovery token marked as used");
    } catch (error) {
      logger.error("OTP", "Failed to mark recovery token as used", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clean up expired OTPs (can be run as cron job)
   */
  async cleanupExpiredOTPs(): Promise<number | undefined> {
    try {
      const result = await databaseService.query(
        "DELETE FROM otps WHERE expires_at < NOW() RETURNING id"
      );

      logger.info("OTP", "Cleaned up expired OTPs", {
        count: result.rowCount,
      });

      return result.rowCount ?? 0;
    } catch (error) {
      logger.error("OTP", "Failed to cleanup expired OTPs", {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Clean up expired recovery tokens
   */
  async cleanupExpiredTokens(): Promise<number | undefined> {
    try {
      const result = await databaseService.query(
        "DELETE FROM recovery_tokens WHERE expires_at < NOW() RETURNING id"
      );

      logger.info("OTP", "Cleaned up expired recovery tokens", {
        count: result.rowCount,
      });

      return result.rowCount ?? 0;
    } catch (error) {
      logger.error("OTP", "Failed to cleanup expired recovery tokens", {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
}

export default new OTPService();
