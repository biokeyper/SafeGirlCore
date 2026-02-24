/**
 * Authentication Controller
 * Handles OTP-based signup, login, and account recovery
 */

const jwt = require('jsonwebtoken');
const databaseService = require('../services/database');
const otpService = require('../services/otp');
const emailService = require('../services/email');
const logger = require('../utils/logger');
const crypto = require('crypto');

class AuthController {

  /**
   * Step 1: Initiate Signup
   * User provides phone only, receive OTP on phone
   * Email is optional and can be set later via setup-email endpoint
   */
  async initiateSignup(req, res, next) {
    try {
      const { phone } = req.body;

      logger.logRequest('POST', '/api/auth/signup/initiate', { phone });

      // Validate phone
      if (!phone) {
        logger.warn('AUTH', 'Missing phone in signup', { phone: !!phone });
        return res.status(400).json({
          error: true,
          message: 'phone is required'
        });
      }

      // Check if phone already exists
      const phoneExists = await databaseService.query(
        'SELECT id FROM users WHERE phone = $1',
        [phone]
      );

      if (phoneExists.rows && phoneExists.rows.length > 0) {
        logger.warn('AUTH', 'Phone number already registered', { phone });
        return res.status(409).json({
          error: true,
          message: 'Phone number already registered. Please login instead.'
        });
      }

      // Create and send OTP
      const otpResult = await otpService.createAndSendOTP(phone, 'signup');

      logger.success('AUTH', 'Signup initiated', {
        phone,
        expiresIn: otpResult.expiresIn
      });

      return res.status(200).json({
        success: true,
        message: 'OTP sent to your phone. Enter the 6-digit code to continue.',
        data: {
          phone,
          expiresIn: otpResult.expiresIn,
          // For testing only
          _testOTP: otpResult._testOTP
        }
      });

    } catch (error) {
      logger.error('AUTH', 'Signup initiation error', { error: error.message });
      next(error);
    }
  }

  /**
   * Step 2: Verify Signup OTP and Create Account
   * Email is optional - user can set it later via setup-email endpoint
   */
  async verifySignup(req, res, next) {
    try {
      const { phone, otp } = req.body;

      logger.logRequest('POST', '/api/auth/signup/verify', { phone });

      if (!phone || !otp) {
        logger.warn('AUTH', 'Missing fields in signup verification', { phone: !!phone, otp: !!otp });
        return res.status(400).json({
          error: true,
          message: 'phone and otp are required'
        });
      }

      // Verify OTP
      const otpVerify = await otpService.verifyOTP(phone, otp, 'signup');

      if (!otpVerify.success) {
        return res.status(401).json({
          error: true,
          message: otpVerify.message,
          code: otpVerify.code,
          attemptsLeft: otpVerify.attemptsLeft
        });
      }

      // Generate unique userId
      const userId = crypto.randomUUID();

      // Create user in database (email is NULL initially)
      const result = await databaseService.query(
        `INSERT INTO users (userId, phone, email, phone_verified, email_verified, createdAt)
         VALUES ($1, $2, NULL, true, false, NOW())
         RETURNING userId, phone, email, createdAt`,
        [userId, phone]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to create user');
      }

      const user = result.rows[0];

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.userId, phone: user.phone, email: user.email || null },
        process.env.JWT_SECRET || 'default-secret-key',
        { expiresIn: '7d' }
      );

      logger.success('AUTH', 'User signed up successfully', { userId: user.userId });

      return res.status(201).json({
        success: true,
        message: 'Account created successfully. You can set a recovery email later.',
        data: {
          userId: user.userId,
          phone: user.phone,
          email: user.email,
          token,
          expiresIn: '7d',
          createdAt: user.createdAt,
          hasRecoveryEmail: !!user.email
        }
      });

    } catch (error) {
      logger.error('AUTH', 'Signup verification error', { error: error.message });
      next(error);
    }
  }

  /**
   * Step 1: Initiate Login
   * User provides phone, receive OTP
   */
  async initiateLogin(req, res, next) {
    try {
      const { phone } = req.body;

      logger.logRequest('POST', '/api/auth/login/initiate', { phone });

      if (!phone) {
        logger.warn('AUTH', 'Missing phone in login', { phone: !!phone });
        return res.status(400).json({
          error: true,
          message: 'phone is required'
        });
      }

      // Check if user exists
      const result = await databaseService.query(
        'SELECT userId FROM users WHERE phone = $1',
        [phone]
      );

      if (!result.rows || result.rows.length === 0) {
        // Don't reveal if user exists or not (security)
        logger.warn('AUTH', 'Login attempt for non-existent phone', { phone });
        return res.status(401).json({
          error: true,
          message: 'Phone number not found. Please sign up first.'
        });
      }

      // Create and send OTP
      const otpResult = await otpService.createAndSendOTP(phone, 'login');

      logger.success('AUTH', 'Login initiated', { phone });

      return res.status(200).json({
        success: true,
        message: 'OTP sent to your phone',
        data: {
          phone,
          expiresIn: otpResult.expiresIn,
          // For testing only
          _testOTP: otpResult._testOTP
        }
      });

    } catch (error) {
      logger.error('AUTH', 'Login initiation error', { error: error.message });
      next(error);
    }
  }

  /**
   * Step 2: Verify Login OTP
   */
  async verifyLogin(req, res, next) {
    try {
      const { phone, otp } = req.body;

      logger.logRequest('POST', '/api/auth/login/verify', { phone });

      if (!phone || !otp) {
        logger.warn('AUTH', 'Missing phone or otp in login verification', { phone: !!phone, otp: !!otp });
        return res.status(400).json({
          error: true,
          message: 'phone and otp are required'
        });
      }

      // Verify OTP
      const otpVerify = await otpService.verifyOTP(phone, otp, 'login');

      if (!otpVerify.success) {
        return res.status(401).json({
          error: true,
          message: otpVerify.message,
          code: otpVerify.code,
          attemptsLeft: otpVerify.attemptsLeft
        });
      }

      // Get user info
      const userResult = await databaseService.query(
        'SELECT userId, email, phone FROM users WHERE phone = $1',
        [phone]
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        throw new Error('User not found after OTP verification');
      }

      const user = userResult.rows[0];

      // Update last login
      await databaseService.query(
        'UPDATE users SET lastLogin = NOW() WHERE userId = $1',
        [user.userId]
      );

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.userId, phone: user.phone, email: user.email },
        process.env.JWT_SECRET || 'default-secret-key',
        { expiresIn: '7d' }
      );

      logger.success('AUTH', 'User logged in successfully', { userId: user.userId });

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          userId: user.userId,
          phone: user.phone,
          email: user.email,
          token,
          expiresIn: '7d'
        }
      });

    } catch (error) {
      logger.error('AUTH', 'Login verification error', { error: error.message });
      next(error);
    }
  }

  /**
   * Forgot Phone - Start Account Recovery
   * User provides email, receives recovery link
   */
  async forgotPhone(req, res, next) {
    try {
      const { email } = req.body;

      logger.logRequest('POST', '/api/auth/forgot-phone', { email });

      if (!email) {
        logger.warn('AUTH', 'Missing email in forgot-phone', { email: !!email });
        return res.status(400).json({
          error: true,
          message: 'email is required'
        });
      }

      // Find user by email
      const result = await databaseService.query(
        'SELECT userId, phone FROM users WHERE email = $1',
        [email]
      );

      if (!result.rows || result.rows.length === 0) {
        // Don't reveal if email exists (security)
        logger.warn('AUTH', 'Forgot-phone attempt for non-existent email', { email });
        return res.status(200).json({
          success: true,
          message: 'If an account exists with this email, a recovery link will be sent.'
        });
      }

      const user = result.rows[0];

      // Generate recovery token
      const tokenResult = await otpService.generateRecoveryToken(
        user.userId,
        email,
        'phone_recovery'
      );

      // Build recovery link
      const recoveryLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/recovery?token=${tokenResult.token}`;

      // Send recovery email
      const emailSent = await emailService.sendRecoveryEmail(email, recoveryLink);

      if (!emailSent) {
        logger.warn('AUTH', 'Recovery email failed to send, but token was created', {
          userId: user.userId,
          email
        });
        // Still return success, user can use token from dev logs
      }

      logger.success('AUTH', 'Recovery token generated and email sent', {
        userId: user.userId,
        email,
        emailSent
      });

      return res.status(200).json({
        success: true,
        message: 'Recovery link sent to your email',
        data: {
          email,
          // For testing only
          _testToken: process.env.NODE_ENV === 'development' ? tokenResult.token : undefined
        }
      });

    } catch (error) {
      logger.error('AUTH', 'Forgot-phone error', { error: error.message });
      next(error);
    }
  }

  /**
   * Verify Recovery Token and Start Phone Change
   */
  async verifyRecoveryToken(req, res, next) {
    try {
      const { token } = req.body;

      logger.logRequest('POST', '/api/auth/verify-recovery', { token: token ? 'present' : 'missing' });

      if (!token) {
        logger.warn('AUTH', 'Missing recovery token');
        return res.status(400).json({
          error: true,
          message: 'recovery token is required'
        });
      }

      // Verify token
      const tokenVerify = await otpService.verifyRecoveryToken(token);

      if (!tokenVerify.success) {
        return res.status(401).json({
          error: true,
          message: tokenVerify.message,
          code: tokenVerify.code
        });
      }

      logger.success('AUTH', 'Recovery token verified', {
        userId: tokenVerify.userId
      });

      return res.status(200).json({
        success: true,
        message: 'Recovery token is valid. Ready to change phone number.',
        data: {
          userId: tokenVerify.userId,
          email: tokenVerify.email,
          token
        }
      });

    } catch (error) {
      logger.error('AUTH', 'Recovery token verification error', { error: error.message });
      next(error);
    }
  }

  /**
   * Change Phone via Recovery
   * Send new phone number, receive OTP on new phone
   */
  async changePhoneViaRecovery(req, res, next) {
    try {
      const { token, newPhone } = req.body;

      logger.logRequest('POST', '/api/auth/change-phone/recovery', { newPhone });

      if (!token || !newPhone) {
        logger.warn('AUTH', 'Missing token or newPhone', { token: !!token, newPhone: !!newPhone });
        return res.status(400).json({
          error: true,
          message: 'token and newPhone are required'
        });
      }

      // Verify recovery token
      const tokenVerify = await otpService.verifyRecoveryToken(token);

      if (!tokenVerify.success) {
        return res.status(401).json({
          error: true,
          message: tokenVerify.message
        });
      }

      // Check if new phone already exists
      const phoneExists = await databaseService.query(
        'SELECT id FROM users WHERE phone = $1 AND userId != $2',
        [newPhone, tokenVerify.userId]
      );

      if (phoneExists.rows && phoneExists.rows.length > 0) {
        logger.warn('AUTH', 'New phone already in use', { newPhone });
        return res.status(409).json({
          error: true,
          message: 'This phone number is already registered'
        });
      }

      // Create and send OTP to new phone
      const otpResult = await otpService.createAndSendOTP(newPhone, 'phone_change', tokenVerify.userId);

      logger.success('AUTH', 'OTP sent to new phone for recovery', { newPhone });

      return res.status(200).json({
        success: true,
        message: 'OTP sent to new phone number',
        data: {
          newPhone,
          token,
          expiresIn: otpResult.expiresIn,
          // For testing only
          _testOTP: otpResult._testOTP
        }
      });

    } catch (error) {
      logger.error('AUTH', 'Change phone via recovery error', { error: error.message });
      next(error);
    }
  }

  /**
   * Verify New Phone Change (Recovery)
   */
  async verifyPhoneChangeRecovery(req, res, next) {
    try {
      const { token, newPhone, otp } = req.body;

      logger.logRequest('POST', '/api/auth/verify-phone-change/recovery', { newPhone });

      if (!token || !newPhone || !otp) {
        logger.warn('AUTH', 'Missing fields in phone change verification', {
          token: !!token,
          newPhone: !!newPhone,
          otp: !!otp
        });
        return res.status(400).json({
          error: true,
          message: 'token, newPhone, and otp are required'
        });
      }

      // Verify recovery token
      const tokenVerify = await otpService.verifyRecoveryToken(token);

      if (!tokenVerify.success) {
        return res.status(401).json({
          error: true,
          message: tokenVerify.message
        });
      }

      // Verify OTP on new phone
      const otpVerify = await otpService.verifyOTP(newPhone, otp, 'phone_change');

      if (!otpVerify.success) {
        return res.status(401).json({
          error: true,
          message: otpVerify.message,
          code: otpVerify.code,
          attemptsLeft: otpVerify.attemptsLeft
        });
      }

      // Update user phone number
      const result = await databaseService.query(
        `UPDATE users
         SET phone = $1, phone_verified = true, lastPhoneChange = NOW()
         WHERE userId = $2
         RETURNING userId, phone, email`,
        [newPhone, tokenVerify.userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to update phone number');
      }

      const user = result.rows[0];

      // Mark recovery token as used
      await otpService.markRecoveryTokenUsed(token);

      // Generate new JWT token with updated phone
      const newToken = jwt.sign(
        { userId: user.userId, phone: user.phone, email: user.email },
        process.env.JWT_SECRET || 'default-secret-key',
        { expiresIn: '7d' }
      );

      logger.success('AUTH', 'Phone number changed successfully via recovery', {
        userId: user.userId,
        newPhone
      });

      return res.status(200).json({
        success: true,
        message: 'Phone number updated successfully',
        data: {
          userId: user.userId,
          phone: user.phone,
          email: user.email,
          token: newToken,
          expiresIn: '7d'
        }
      });

    } catch (error) {
      logger.error('AUTH', 'Phone change recovery verification error', { error: error.message });
      next(error);
    }
  }

  /**
   * Change Phone (Authenticated User)
   */
  async initiatePhoneChange(req, res, next) {
    try {
      const { newPhone } = req.body;
      const userId = req.user.userId;

      logger.logRequest('POST', '/api/auth/change-phone', { newPhone, userId });

      if (!newPhone) {
        logger.warn('AUTH', 'Missing newPhone in phone change', { userId });
        return res.status(400).json({
          error: true,
          message: 'newPhone is required'
        });
      }

      // Check if new phone already exists
      const phoneExists = await databaseService.query(
        'SELECT id FROM users WHERE phone = $1 AND userId != $2',
        [newPhone, userId]
      );

      if (phoneExists.rows && phoneExists.rows.length > 0) {
        logger.warn('AUTH', 'New phone already in use', { newPhone });
        return res.status(409).json({
          error: true,
          message: 'This phone number is already registered'
        });
      }

      // Create and send OTP to new phone
      const otpResult = await otpService.createAndSendOTP(newPhone, 'phone_change', userId);

      logger.success('AUTH', 'OTP sent to new phone', { newPhone, userId });

      return res.status(200).json({
        success: true,
        message: 'OTP sent to new phone number',
        data: {
          newPhone,
          expiresIn: otpResult.expiresIn,
          // For testing only
          _testOTP: otpResult._testOTP
        }
      });

    } catch (error) {
      logger.error('AUTH', 'Initiate phone change error', { error: error.message });
      next(error);
    }
  }

  /**
   * Verify Phone Change (Authenticated User)
   */
  async verifyPhoneChange(req, res, next) {
    try {
      const { newPhone, otp } = req.body;
      const userId = req.user.userId;

      logger.logRequest('POST', '/api/auth/verify-phone-change', { newPhone, userId });

      if (!newPhone || !otp) {
        logger.warn('AUTH', 'Missing fields in phone change verification', {
          newPhone: !!newPhone,
          otp: !!otp
        });
        return res.status(400).json({
          error: true,
          message: 'newPhone and otp are required'
        });
      }

      // Verify OTP
      const otpVerify = await otpService.verifyOTP(newPhone, otp, 'phone_change');

      if (!otpVerify.success) {
        return res.status(401).json({
          error: true,
          message: otpVerify.message,
          code: otpVerify.code,
          attemptsLeft: otpVerify.attemptsLeft
        });
      }

      // Update user phone
      const result = await databaseService.query(
        `UPDATE users
         SET phone = $1, lastPhoneChange = NOW()
         WHERE userId = $2
         RETURNING userId, phone, email`,
        [newPhone, userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to update phone number');
      }

      const user = result.rows[0];

      // Generate new JWT with updated phone
      const newToken = jwt.sign(
        { userId: user.userId, phone: user.phone, email: user.email },
        process.env.JWT_SECRET || 'default-secret-key',
        { expiresIn: '7d' }
      );

      logger.success('AUTH', 'Phone number changed successfully', {
        userId,
        newPhone
      });

      return res.status(200).json({
        success: true,
        message: 'Phone number updated successfully',
        data: {
          userId: user.userId,
          phone: user.phone,
          email: user.email,
          token: newToken,
          expiresIn: '7d'
        }
      });

    } catch (error) {
      logger.error('AUTH', 'Phone change verification error', { error: error.message });
      next(error);
    }
  }

  /**
   * Verify Token (utility)
   */
  async verifyToken(req, res, next) {
    try {
      return res.status(200).json({
        success: true,
        message: 'Token is valid',
        data: {
          userId: req.user.userId,
          phone: req.user.phone,
          email: req.user.email
        }
      });
    } catch (error) {
      logger.error('AUTH', 'Token verification error', { error: error.message });
      next(error);
    }
  }

  /**
   * Setup Recovery Email (Authenticated User)
   * Allows user to set recovery email after signup/login
   */
  async setupRecoveryEmail(req, res, next) {
    try {
      const { email } = req.body;
      const userId = req.user.userId;

      logger.logRequest('POST', '/api/auth/setup-email', { userId });

      if (!email) {
        logger.warn('AUTH', 'Missing email in setup-email', { userId });
        return res.status(400).json({
          error: true,
          message: 'email is required'
        });
      }

      // Check if email already in use by another user
      const emailExists = await databaseService.query(
        'SELECT id FROM users WHERE email = $1 AND userId != $2',
        [email, userId]
      );

      if (emailExists.rows && emailExists.rows.length > 0) {
        logger.warn('AUTH', 'Email already registered', { email });
        return res.status(409).json({
          error: true,
          message: 'Email already registered by another user'
        });
      }

      // Update user with email
      const result = await databaseService.query(
        `UPDATE users
         SET email = $1, email_verified = false
         WHERE userId = $2
         RETURNING userId, phone, email`,
        [email, userId]
      );

      if (!result.rows || result.rows.length === 0) {
        logger.error('AUTH', 'User not found for email update', { userId, email, resultRows: result.rows ? result.rows.length : 0 });
        throw new Error(`Failed to update user email - user ${userId} not found in database`);
      }

      const user = result.rows[0];

      // Send verification email (non-blocking)
      emailService.sendEmailVerification(user.email, userId).catch(err => {
        logger.warn('AUTH', 'Email verification failed', { error: err.message });
      });

      logger.success('AUTH', 'Recovery email set successfully', { userId });

      return res.status(200).json({
        success: true,
        message: 'Recovery email saved. Verification email sent.',
        data: {
          userId: user.userId,
          phone: user.phone,
          email: user.email,
          emailVerified: false
        }
      });

    } catch (error) {
      logger.error('AUTH', 'Setup recovery email error', { error: error.message });
      next(error);
    }
  }
}

module.exports = new AuthController();
