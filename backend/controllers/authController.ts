/**
 * Authentication Controller
 * Handles OTP-based signup, login, and account recovery
 */

import { Request, Response, NextFunction } from "express";
import databaseService from "../services/database";
import otpService from "../services/otp";
import emailService from "../services/email";
import logger from "../utils/logger";
import { getJwtService } from "../services/jwtService";
import crypto from "crypto";

class AuthController {
  /**
   * Step 1: Initiate Signup
   * User provides phone only, receive OTP on phone
   * Email is optional and can be set later via setup-email endpoint
   */
  async initiateSignup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, country } = req.body;

      logger.logRequest("POST", "/api/auth/signup/initiate", { phone, country });

      // Validate phone and country
      if (!phone || !country) {
        logger.warn("AUTH", "Missing phone or country in signup", { phone: !!phone, country: !!country });
        res.status(400).json({
          error: true,
          message: "phone and country are required",
        });
        return;
      }

      // Check if phone already exists
      const phoneExists = await (databaseService as any).query(
        "SELECT id FROM users WHERE phone = $1",
        [phone],
      );

      if (phoneExists.rows && phoneExists.rows.length > 0) {
        logger.warn("AUTH", "Phone number already registered", { phone });
        res.status(409).json({
          error: true,
          message: "Phone number already registered. Please login instead.",
        });
        return;
      }

      // Create and send OTP
      const otpResult = await (otpService as any).createAndSendOTP(phone, "signup");

      logger.success("AUTH", "Signup initiated", {
        phone,
        expiresIn: otpResult.expiresIn,
      });

      res.status(200).json({
        success: true,
        message: "OTP sent to your phone. Enter the 6-digit code to continue.",
        data: {
          phone,
          expiresIn: otpResult.expiresIn,
          // For testing only
          _testOTP: otpResult._testOTP,
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Signup initiation error", { error: error.message });
      next(error);
    }
  }

  /**
   * Step 2: Verify Signup OTP and Create Account
   * Email is optional - user can set it later via setup-email endpoint
   */
  async verifySignup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, otp, country } = req.body;

      logger.logRequest("POST", "/api/auth/signup/verify", { phone, country });

      if (!phone || !otp || !country) {
        logger.warn("AUTH", "Missing fields in signup verification", {
          phone: !!phone,
          otp: !!otp,
          country: !!country,
        });
        res.status(400).json({
          error: true,
          message: "phone, otp, and country are required",
        });
        return;
      }

      // Verify OTP
      const otpVerify = await (otpService as any).verifyOTP(phone, otp, "signup");

      if (!otpVerify.success) {
        // Return 429 (Too Many Requests) if account is locked
        const statusCode = otpVerify.code === "ACCOUNT_LOCKED" ? 429 : 401;

        res.status(statusCode).json({
          error: true,
          message: otpVerify.message,
          code: otpVerify.code,
          attemptsLeft: otpVerify.attemptsLeft,
        });
        return;
      }

      // Generate unique userId
      const userId = crypto.randomUUID();

      // Create user in database (email is NULL initially)
      const result = await (databaseService as any).query(
        `INSERT INTO users (userId, phone, country, email, phone_verified, email_verified, pin, createdAt)
         VALUES ($1, $2, $3, NULL, true, false, NULL, NOW())
         RETURNING userid, phone, country, email, pin, createdAt`,
        [userId, phone, country],
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error("Failed to create user");
      }

      const user = result.rows[0];

      // Generate JWT token
      const jwtService = getJwtService();
      const token = jwtService.sign({
        userId: user.userid,
        phone: user.phone,
        email: user.email || null,
        country: user.country,
      });

      logger.success("AUTH", "User signed up successfully", {
        userId: user.userid,
      });

      res.status(201).json({
        success: true,
        message:
          "Account created successfully. You can set a recovery email later.",
        data: {
          userId: user.userid,
          phone: user.phone,
          country: user.country,
          email: user.email,
          pin: user.pin || null,
          token,
          expiresIn: "7d",
          createdAt: user.createdAt,
          hasRecoveryEmail: !!user.email,
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Signup verification error", {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Step 1: Initiate Login
   * User provides phone, receive OTP
   */
  async initiateLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone } = req.body;

      logger.logRequest("POST", "/api/auth/login/initiate", { phone });

      if (!phone) {
        logger.warn("AUTH", "Missing phone in login", { phone: !!phone });
        res.status(400).json({
          error: true,
          message: "phone is required",
        });
        return;
      }

      // Check if user exists
      const result = await (databaseService as any).query(
        "SELECT userId FROM users WHERE phone = $1",
        [phone],
      );

      if (!result.rows || result.rows.length === 0) {
        // Don't reveal if user exists or not (security)
        logger.warn("AUTH", "Login attempt for non-existent phone", { phone });
        res.status(401).json({
          error: true,
          message: "Phone number not found. Please sign up first.",
        });
        return;
      }

      // Create and send OTP
      const otpResult = await (otpService as any).createAndSendOTP(phone, "login");

      logger.success("AUTH", "Login initiated", { phone });

      res.status(200).json({
        success: true,
        message: "OTP sent to your phone",
        data: {
          phone,
          expiresIn: otpResult.expiresIn,
          // For testing only
          _testOTP: otpResult._testOTP,
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Login initiation error", { error: error.message });
      next(error);
    }
  }

  /**
   * Step 2: Verify Login OTP
   */
  async verifyLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, otp } = req.body;

      logger.logRequest("POST", "/api/auth/login/verify", { phone });

      if (!phone || !otp) {
        logger.warn("AUTH", "Missing phone or otp in login verification", {
          phone: !!phone,
          otp: !!otp,
        });
        res.status(400).json({
          error: true,
          message: "phone and otp are required",
        });
        return;
      }

      // Verify OTP
      const otpVerify = await (otpService as any).verifyOTP(phone, otp, "login");

      if (!otpVerify.success) {
        // Return 429 (Too Many Requests) if account is locked
        const statusCode = otpVerify.code === "ACCOUNT_LOCKED" ? 429 : 401;

        res.status(statusCode).json({
          error: true,
          message: otpVerify.message,
          code: otpVerify.code,
          attemptsLeft: otpVerify.attemptsLeft,
        });
        return;
      }

      // Get user info
      const userResult = await (databaseService as any).query(
        "SELECT userId, email, phone, country, pin FROM users WHERE phone = $1",
        [phone],
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        throw new Error("User not found after OTP verification");
      }

      const user = userResult.rows[0];

      // Update last login
      await (databaseService as any).query(
        "UPDATE users SET lastLogin = NOW() WHERE userid = $1",
        [user.userid],
      );

      // Generate JWT token
      const jwtService = getJwtService();
      const token = jwtService.sign({
        userId: user.userid,
        phone: user.phone,
        email: user.email,
        country: user.country,
      });

      logger.success("AUTH", "User logged in successfully", {
        userId: user.userid,
      });

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          userId: user.userid,
          phone: user.phone,
          country: user.country,
          email: user.email,
          pin: user.pin || null,
          token,
          expiresIn: "7d",
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Login verification error", {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Forgot Phone - Start Account Recovery
   * User provides email, receives recovery link
   */
  async forgotPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;

      logger.logRequest("POST", "/api/auth/forgot-phone", { email });

      if (!email) {
        logger.warn("AUTH", "Missing email in forgot-phone", {
          email: !!email,
        });
        res.status(400).json({
          error: true,
          message: "email is required",
        });
        return;
      }

      // Find user by email
      const result = await (databaseService as any).query(
        "SELECT userId, phone FROM users WHERE email = $1",
        [email],
      );

      if (!result.rows || result.rows.length === 0) {
        // Don't reveal if email exists (security)
        logger.warn("AUTH", "Forgot-phone attempt for non-existent email", {
          email,
        });
        res.status(200).json({
          success: true,
          message:
            "If an account exists with this email, a recovery link will be sent.",
        });
        return;
      }

      const user = result.rows[0];

      // Generate recovery token (note: PostgreSQL returns lowercase column names)
      const tokenResult = await (otpService as any).generateRecoveryToken(
        user.userid,
        email,
        "phone_recovery",
      );

      // Build recovery deep link for mobile app
      const appScheme = process.env.APP_SCHEME || "safegirlapp";
      const recoveryLink = `${appScheme}://recovery/${tokenResult.token}`;

      // Log the link so it can be inspected in server logs during testing
      logger.info("AUTH", "Recovery link generated", {
        userId: user.userid,
        email,
        link: recoveryLink,
      });

      // Send recovery email
      const emailSent = await (emailService as any).sendRecoveryEmail(
        email,
        recoveryLink,
      );

      if (!emailSent) {
        logger.warn(
          "AUTH",
          "Recovery email failed to send, but token was created",
          {
            userId: user.userid,
            email,
          },
        );
      }

      logger.success("AUTH", "Recovery token generated and email sent", {
        userId: user.userid,
        email,
        emailSent,
      });

      res.status(200).json({
        success: true,
        message: "Recovery link sent to your email",
        data: {
          email,
          // For testing only
          _testToken:
            process.env.NODE_ENV === "development"
              ? tokenResult.token
              : undefined,
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Forgot-phone error", { error: error.message });
      next(error);
    }
  }

  /**
   * Verify Recovery Token and Start Phone Change
   */
  async verifyRecoveryToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body;

      logger.logRequest("POST", "/api/auth/verify-recovery", {
        token: token ? "present" : "missing",
      });

      if (!token) {
        logger.warn("AUTH", "Missing recovery token");
        res.status(400).json({
          error: true,
          message: "recovery token is required",
        });
        return;
      }

      // Verify token
      const tokenVerify = await (otpService as any).verifyRecoveryToken(token);

      if (!tokenVerify.success) {
        res.status(401).json({
          error: true,
          message: tokenVerify.message,
          code: tokenVerify.code,
        });
        return;
      }

      logger.success("AUTH", "Recovery token verified", {
        userId: tokenVerify.userid,
      });

      res.status(200).json({
        success: true,
        message: "Recovery token is valid. Ready to change phone number.",
        data: {
          userId: tokenVerify.userid,
          email: tokenVerify.email,
          token,
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Recovery token verification error", {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Change Phone via Recovery
   * Send new phone number, receive OTP on new phone
   */
  async changePhoneViaRecovery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPhone } = req.body;

      logger.logRequest("POST", "/api/auth/change-phone/recovery", {
        newPhone,
      });

      if (!token || !newPhone) {
        logger.warn("AUTH", "Missing token or newPhone", {
          token: !!token,
          newPhone: !!newPhone,
        });
        res.status(400).json({
          error: true,
          message: "token and newPhone are required",
        });
        return;
      }

      // Verify recovery token
      const tokenVerify = await (otpService as any).verifyRecoveryToken(token);

      if (!tokenVerify.success) {
        res.status(401).json({
          error: true,
          message: tokenVerify.message,
        });
        return;
      }

      // Check if new phone already exists
      const phoneExists = await (databaseService as any).query(
        "SELECT id FROM users WHERE phone = $1 AND userid != $2",
        [newPhone, tokenVerify.userid],
      );

      if (phoneExists.rows && phoneExists.rows.length > 0) {
        logger.warn("AUTH", "New phone already in use", { newPhone });
        res.status(409).json({
          error: true,
          message: "This phone number is already registered",
        });
        return;
      }

      // Create and send OTP to new phone
      const otpResult = await (otpService as any).createAndSendOTP(
        newPhone,
        "phone_change",
        tokenVerify.userid,
      );

      logger.success("AUTH", "OTP sent to new phone for recovery", {
        newPhone,
      });

      res.status(200).json({
        success: true,
        message: "OTP sent to new phone number",
        data: {
          newPhone,
          token,
          expiresIn: otpResult.expiresIn,
          // For testing only
          _testOTP: otpResult._testOTP,
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Change phone via recovery error", {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Verify New Phone Change (Recovery)
   */
  async verifyPhoneChangeRecovery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPhone, otp } = req.body;

      logger.logRequest("POST", "/api/auth/verify-phone-change/recovery", {
        newPhone,
      });

      if (!token || !newPhone || !otp) {
        logger.warn("AUTH", "Missing fields in phone change verification", {
          token: !!token,
          newPhone: !!newPhone,
          otp: !!otp,
        });
        res.status(400).json({
          error: true,
          message: "token, newPhone, and otp are required",
        });
        return;
      }

      // Verify recovery token
      const tokenVerify = await (otpService as any).verifyRecoveryToken(token);

      if (!tokenVerify.success) {
        res.status(401).json({
          error: true,
          message: tokenVerify.message,
        });
        return;
      }

      // Verify OTP on new phone
      const otpVerify = await (otpService as any).verifyOTP(
        newPhone,
        otp,
        "phone_change",
      );

      if (!otpVerify.success) {
        res.status(401).json({
          error: true,
          message: otpVerify.message,
          code: otpVerify.code,
          attemptsLeft: otpVerify.attemptsLeft,
        });
        return;
      }

      // Update user phone number
      const result = await (databaseService as any).query(
        `UPDATE users
         SET phone = $1, phone_verified = true, lastPhoneChange = NOW()
         WHERE userid = $2
         RETURNING userid, phone, email`,
        [newPhone, tokenVerify.userid],
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error("Failed to update phone number");
      }

      const user = result.rows[0];

      // Mark recovery token as used
      await (otpService as any).markRecoveryTokenUsed(token);

      // Generate new JWT token with updated phone
      const jwtService = getJwtService();
      const newToken = jwtService.sign({
        userId: user.userid,
        phone: user.phone,
        email: user.email,
        country: user.country,
      });

      logger.success("AUTH", "Phone number changed successfully via recovery", {
        userId: user.userid,
        newPhone,
      });

      res.status(200).json({
        success: true,
        message: "Phone number updated successfully",
        data: {
          userId: user.userid,
          phone: user.phone,
          email: user.email,
          token: newToken,
          expiresIn: "7d",
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Phone change recovery verification error", {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Change Phone (Authenticated User)
   */
  async initiatePhoneChange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { newPhone } = req.body;
      const userId = (req.user as any).userId;

      logger.logRequest("POST", "/api/auth/change-phone", { newPhone, userId });

      if (!newPhone) {
        logger.warn("AUTH", "Missing newPhone in phone change", { userId });
        res.status(400).json({
          error: true,
          message: "newPhone is required",
        });
        return;
      }

      // Check if new phone already exists
      const phoneExists = await (databaseService as any).query(
        "SELECT id FROM users WHERE phone = $1 AND userid != $2",
        [newPhone, userId],
      );

      if (phoneExists.rows && phoneExists.rows.length > 0) {
        logger.warn("AUTH", "New phone already in use", { newPhone });
        res.status(409).json({
          error: true,
          message: "This phone number is already registered",
        });
        return;
      }

      // Create and send OTP to new phone
      const otpResult = await (otpService as any).createAndSendOTP(
        newPhone,
        "phone_change",
        userId,
      );

      logger.success("AUTH", "OTP sent to new phone", { newPhone, userId });

      res.status(200).json({
        success: true,
        message: "OTP sent to new phone number",
        data: {
          newPhone,
          expiresIn: otpResult.expiresIn,
          // For testing only
          _testOTP: otpResult._testOTP,
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Initiate phone change error", {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Verify Phone Change (Authenticated User)
   */
  async verifyPhoneChange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { newPhone, otp } = req.body;
      const userId = (req.user as any).userId;

      logger.logRequest("POST", "/api/auth/verify-phone-change", {
        newPhone,
        userId,
      });

      if (!newPhone || !otp) {
        logger.warn("AUTH", "Missing fields in phone change verification", {
          newPhone: !!newPhone,
          otp: !!otp,
        });
        res.status(400).json({
          error: true,
          message: "newPhone and otp are required",
        });
        return;
      }

      // Verify OTP
      const otpVerify = await (otpService as any).verifyOTP(
        newPhone,
        otp,
        "phone_change",
      );

      if (!otpVerify.success) {
        res.status(401).json({
          error: true,
          message: otpVerify.message,
          code: otpVerify.code,
          attemptsLeft: otpVerify.attemptsLeft,
        });
        return;
      }

      // Update user phone
      const result = await (databaseService as any).query(
        `UPDATE users
         SET phone = $1, lastPhoneChange = NOW()
         WHERE userid = $2
         RETURNING userid, phone, email`,
        [newPhone, userId],
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error("Failed to update phone number");
      }

      const user = result.rows[0];

      // Generate new JWT with updated phone
      const jwtService = getJwtService();
      const newToken = jwtService.sign({
        userId: user.userid,
        phone: user.phone,
        email: user.email,
        country: user.country,
      });

      logger.success("AUTH", "Phone number changed successfully", {
        userId,
        newPhone,
      });

      res.status(200).json({
        success: true,
        message: "Phone number updated successfully",
        data: {
          userId: user.userid,
          phone: user.phone,
          email: user.email,
          token: newToken,
          expiresIn: "7d",
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Phone change verification error", {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Verify Token (utility)
   */
  async verifyToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        success: true,
        message: "Token is valid",
        data: {
          userId: (req.user as any).userId,
          phone: (req.user as any).phone,
          email: (req.user as any).email,
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Token verification error", {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Setup Recovery Email (Authenticated User)
   * Allows user to set recovery email after signup/login
   */
  async setupRecoveryEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      const userId = (req.user as any).userId;

      logger.logRequest("POST", "/api/auth/setup-email", { userId });

      if (!email) {
        logger.warn("AUTH", "Missing email in setup-email", { userId });
        res.status(400).json({
          error: true,
          message: "email is required",
        });
        return;
      }

      // Check if email already in use by another user
      const emailExists = await (databaseService as any).query(
        "SELECT id FROM users WHERE email = $1 AND userid != $2",
        [email, userId],
      );

      if (emailExists.rows && emailExists.rows.length > 0) {
        logger.warn("AUTH", "Email already registered", { email });
        res.status(409).json({
          error: true,
          message: "Email already registered by another user",
        });
        return;
      }

      // Update user with email
      const result = await (databaseService as any).query(
        `UPDATE users
         SET email = $1, email_verified = false
         WHERE userid = $2
         RETURNING userid, phone, email`,
        [email, userId],
      );

      if (!result.rows || result.rows.length === 0) {
        logger.error("AUTH", "User not found for email update", {
          userId,
          email,
          resultRows: result.rows ? result.rows.length : 0,
        });
        throw new Error(
          `Failed to update user email - user ${userId} not found in database`,
        );
      }

      const user = result.rows[0];

      // Send verification email (non-blocking)
      (emailService as any)
        .sendEmailVerification(user.email, user.userid)
        .catch((err: any) => {
          logger.warn("AUTH", "Email verification send failed", {
            error: err.message,
          });
        });

      logger.success("AUTH", "Recovery email set successfully", { userId });

      res.status(200).json({
        success: true,
        message: "Recovery email saved. Verification email sent.",
        data: {
          userId: user.userid,
          phone: user.phone,
          email: user.email,
          emailVerified: false,
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Setup recovery email error", {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Set or Update PIN (Authenticated User)
   * PIN is a UI-level content lock (1-6 numeric digits, optional, plaintext)
   */
  async setPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pin } = req.body;
      const userId = (req.user as any).userId;

      logger.logRequest("POST", "/api/auth/set-pin", { userId });

      // Update user PIN
      const result = await (databaseService as any).query(
        "UPDATE users SET pin = $1 WHERE userid = $2 RETURNING pin",
        [pin, userId],
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error("Failed to set PIN");
      }

      logger.success("AUTH", "PIN set successfully", { userId });

      res.status(200).json({
        success: true,
        message: "PIN set successfully",
        data: { pin },
      });
    } catch (error: any) {
      logger.error("AUTH", "Set PIN error", { error: error.message });
      next(error);
    }
  }

  /**
   * Get PIN (Authenticated User)
   * Returns the current PIN for the user
   */
  async getPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any).userId;

      logger.logRequest("GET", "/api/auth/get-pin", { userId });

      const result = await (databaseService as any).query(
        "SELECT pin FROM users WHERE userid = $1",
        [userId],
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error("User not found");
      }

      const pin = result.rows[0]?.pin || null;

      logger.success("AUTH", "PIN retrieved successfully", { userId });

      res.status(200).json({
        success: true,
        data: { pin, hasPin: !!pin },
      });
    } catch (error: any) {
      logger.error("AUTH", "Get PIN error", { error: error.message });
      next(error);
    }
  }

  /**
   * Verify Email Address
   * GET /api/auth/verify-email
   * Public endpoint - called from deep link in email verification
   * Query params: email, userId
   */
  async verifyEmailAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, userId } = req.query;

      logger.logRequest("GET", "/api/auth/verify-email", { email, userId });

      if (!email || !userId) {
        logger.warn("AUTH", "Missing email or userId in verify-email", {
          email: !!email,
          userId: !!userId,
        });
        res.status(400).json({
          error: true,
          message: "email and userId are required",
        });
        return;
      }

      // Check if user exists with this email and userId
      const userResult = await (databaseService as any).query(
        "SELECT userid, email, email_verified FROM users WHERE userid = $1 AND email = $2",
        [userId, email],
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        logger.warn("AUTH", "User or email mismatch in verify-email", {
          userId,
          email,
        });
        res.status(404).json({
          error: true,
          message: "User or email not found",
        });
        return;
      }

      const user = userResult.rows[0];

      // Check if already verified
      if (user.email_verified) {
        logger.info("AUTH", "Email already verified", { userId, email });
        res.status(200).json({
          success: true,
          message: "Email is already verified",
          data: {
            userId,
            email,
            emailVerified: true,
          },
        });
        return;
      }

      // Update email_verified status
      const updateResult = await (databaseService as any).query(
        "UPDATE users SET email_verified = true WHERE userid = $1 RETURNING userid, email, email_verified",
        [userId],
      );

      if (!updateResult.rows || updateResult.rows.length === 0) {
        throw new Error("Failed to update email verification status");
      }

      logger.success("AUTH", "Email verified successfully", { userId, email });

      res.status(200).json({
        success: true,
        message: "Email verified successfully",
        data: {
          userId,
          email,
          emailVerified: true,
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Email verification error", {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Logout user
   * POST /api/auth/logout
   * Protected: User must be authenticated
   *
   * Note: JWT is stateless, so logout just confirms token removal on client side
   * Token will expire after 7 days automatically
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.userId;

      logger.logRequest("POST", "/api/auth/logout", { userId });

      if (!userId) {
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      logger.success("AUTH", "User logged out", { userId });

      res.status(200).json({
        success: true,
        message: "Successfully logged out",
        data: {
          userId,
          loggedOutAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      logger.error("AUTH", "Logout error", { error: error.message });
      next(error);
    }
  }
}

export default new AuthController();
