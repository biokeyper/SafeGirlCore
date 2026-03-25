/**
 * Validation Middleware
 * Validates incoming requests before processing
 */

import logger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

/**
 * Validate submitReport request
 * New format: multipart/form-data with:
 * - payload: JSON string containing { responses, metadata }
 * - audio: audio file (optional, only for audio reports)
 */
function validateSubmitReport(req: Request, res: Response, next: NextFunction): void {
  try {
    const { payload } = req.body;
    const audioFile = (req as any).file; // multer provides the file here

    // Check required payload field
    if (!payload) {
      logger.logValidation('payload', 'Missing field');
      res.status(400).json({
        error: true,
        message: 'Missing field: payload (must be JSON string)'
      });
      return;
    }

    // Parse payload JSON string
    let payloadObj: any;
    try {
      payloadObj = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch (e) {
      logger.logValidation('payload', 'Invalid JSON');
      res.status(400).json({
        error: true,
        message: 'payload must be a valid JSON string'
      });
      return;
    }

    const { responses, metadata } = payloadObj;

    // Responses are optional (frontend can send text, audio, or both)
    if (responses && Array.isArray(responses)) {
      for (let i = 0; i < responses.length; i++) {
        if (typeof responses[i] !== 'string') {
          logger.logValidation(`responses[${i}]`, 'Must be a string');
          res.status(400).json({
            error: true,
            message: `Response ${i} must be a string`
          });
          return;
        }

        if (responses[i].length > 1000) {
          logger.logValidation(`responses[${i}]`, 'Exceeds 1000 chars');
          res.status(400).json({
            error: true,
            message: `Response ${i} exceeds 1000 character limit`
          });
          return;
        }
      }
    }

    // Optional metadata validation
    if (metadata && typeof metadata !== 'object') {
      logger.logValidation('metadata', 'Must be an object');
      res.status(400).json({
        error: true,
        message: 'Metadata must be an object'
      });
      return;
    }

    // For audio reports, audio file is required
    if (metadata?.type === 'audio' && !audioFile) {
      logger.logValidation('audio', 'Missing for audio report');
      res.status(400).json({
        error: true,
        message: 'audio file is required for audio reports'
      });
      return;
    }

    logger.info('VALIDATION', 'Submit report validated successfully', {
      hasResponses: !!responses,
      hasMetadata: !!metadata,
      hasAudioFile: !!audioFile,
      reportType: metadata?.type || 'text'
    });
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Validation error', { error: (error as Error).message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate status check request
 */
function validateStatusRequest(req: Request, res: Response, next: NextFunction): void {
  try {
    const { reportId } = req.query;

    if (!reportId || typeof reportId !== 'string') {
      logger.logValidation('reportId', 'Missing or invalid');
      res.status(400).json({
        error: true,
        message: 'Query parameter "reportId" is required'
      });
      return;
    }

    if (reportId.length > 256) {
      logger.logValidation('reportId', 'Exceeds 256 chars');
      res.status(400).json({
        error: true,
        message: 'reportId exceeds maximum length'
      });
      return;
    }

    logger.info('VALIDATION', 'Status request validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Validation error', { error: (error as Error).message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate wallet address format
 */
function isValidAddress(address: string): boolean {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate phone format
 */
function isValidPhone(phone: string): boolean {
  // Allow: +254712345678, 0712345678, 254712345678
  // Min 10 digits, max 15 (E.164 standard)
  const phoneDigitsOnly = phone.replace(/\D/g, '');
  return phoneDigitsOnly.length >= 10 && phoneDigitsOnly.length <= 15;
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return !!(email && email.length <= 255 && emailRegex.test(email));
}

/**
 * Validate signup initiation request (OTP-based, phone only)
 */
function validateSignup(req: Request, res: Response, next: NextFunction): void {
  try {
    const { phone } = req.body;

    // Validate phone
    if (!phone || typeof phone !== 'string') {
      logger.logValidation('phone', 'Missing or invalid');
      res.status(400).json({
        error: true,
        message: 'phone is required and must be a string'
      });
      return;
    }

    if (!isValidPhone(phone)) {
      logger.logValidation('phone', 'Invalid format');
      res.status(400).json({
        error: true,
        message: 'Phone number must contain 10-15 digits'
      });
      return;
    }

    logger.info('VALIDATION', 'Signup request validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Signup validation error', { error: (error as Error).message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate login initiation request (phone only)
 */
function validateLogin(req: Request, res: Response, next: NextFunction): void {
  try {
    const { phone } = req.body;

    // Validate phone
    if (!phone || typeof phone !== 'string') {
      logger.logValidation('phone', 'Missing or invalid');
      res.status(400).json({
        error: true,
        message: 'phone is required and must be a string'
      });
      return;
    }

    if (!isValidPhone(phone)) {
      logger.logValidation('phone', 'Invalid format');
      res.status(400).json({
        error: true,
        message: 'Phone number must contain 10-15 digits'
      });
      return;
    }

    logger.info('VALIDATION', 'Login request validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Login validation error', { error: (error as Error).message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate OTP verification request
 */
function validateOTP(req: Request, res: Response, next: NextFunction): void {
  try {
    const { phone, otp } = req.body;

    // Validate OTP
    if (!otp || typeof otp !== 'string') {
      logger.logValidation('otp', 'Missing or invalid');
      res.status(400).json({
        error: true,
        message: 'otp is required'
      });
      return;
    }

    // OTP should be 6 digits
    if (!/^\d{6}$/.test(otp)) {
      logger.logValidation('otp', 'Invalid format');
      res.status(400).json({
        error: true,
        message: 'OTP must be 6 digits'
      });
      return;
    }

    // For signup or login verification, require phone
    if (req.path.includes('signup/verify') || req.path.includes('login/verify')) {
      if (!phone) {
        logger.logValidation('phone', 'Missing for OTP verification');
        res.status(400).json({
          error: true,
          message: 'phone is required'
        });
        return;
      }
    }

    logger.info('VALIDATION', 'OTP validation successful');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'OTP validation error', { error: (error as Error).message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate phone change request
 */
function validatePhoneChange(req: Request, res: Response, next: NextFunction): void {
  try {
    const { newPhone } = req.body;

    if (!newPhone || typeof newPhone !== 'string') {
      logger.logValidation('newPhone', 'Missing or invalid');
      res.status(400).json({
        error: true,
        message: 'newPhone is required'
      });
      return;
    }

    if (!isValidPhone(newPhone)) {
      logger.logValidation('newPhone', 'Invalid format');
      res.status(400).json({
        error: true,
        message: 'Phone number must contain 10-15 digits'
      });
      return;
    }

    logger.info('VALIDATION', 'Phone change request validated');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Phone change validation error', { error: (error as Error).message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate forgot phone request
 */
function validateForgotPhone(req: Request, res: Response, next: NextFunction): void {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      logger.logValidation('email', 'Missing or invalid');
      res.status(400).json({
        error: true,
        message: 'email is required'
      });
      return;
    }

    if (!isValidEmail(email)) {
      logger.logValidation('email', 'Invalid format');
      res.status(400).json({
        error: true,
        message: 'Invalid email format'
      });
      return;
    }

    logger.info('VALIDATION', 'Forgot phone request validated');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Forgot phone validation error', { error: (error as Error).message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate PIN format
 * PIN must be 1-6 numeric digits
 */
function validatePin(req: Request, res: Response, next: NextFunction): void {
  try {
    const { pin } = req.body;

    if (!pin) {
      logger.logValidation('pin', 'Missing field');
      res.status(400).json({
        error: true,
        message: 'pin is required'
      });
      return;
    }

    if (!/^\d{1,6}$/.test(pin)) {
      logger.logValidation('pin', 'Invalid format');
      res.status(400).json({
        error: true,
        message: 'pin must be 1-6 digits'
      });
      return;
    }

    logger.info('VALIDATION', 'PIN validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'PIN validation error', { error: (error as Error).message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate panic message (custom message for emergency contacts)
 * Max 255 characters, required but can be any text
 */
function validatePanicMessage(req: Request, res: Response, next: NextFunction): void {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      logger.logValidation('message', 'Missing or invalid');
      res.status(400).json({
        error: true,
        message: 'message is required and must be a string'
      });
      return;
    }

    if (message.trim().length === 0) {
      logger.logValidation('message', 'Empty message');
      res.status(400).json({
        error: true,
        message: 'message cannot be empty'
      });
      return;
    }

    if (message.length > 255) {
      logger.logValidation('message', 'Exceeds 255 chars');
      res.status(400).json({
        error: true,
        message: 'message must not exceed 255 characters'
      });
      return;
    }

    logger.info('VALIDATION', 'Panic message validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Panic message validation error', { error: (error as Error).message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate emergency contact (phone + optional relationship)
 */
function validateEmergencyContact(req: Request, res: Response, next: NextFunction): void {
  try {
    const { phone, name, relationship } = req.body;

    // Validate phone
    if (!phone || typeof phone !== 'string') {
      logger.logValidation('phone', 'Missing or invalid');
      res.status(400).json({
        error: true,
        message: 'phone is required and must be a string'
      });
      return;
    }

    if (!isValidPhone(phone)) {
      logger.logValidation('phone', 'Invalid format');
      res.status(400).json({
        error: true,
        message: 'Phone number must contain 10-15 digits'
      });
      return;
    }

    // Validate name (optional but if provided, must be string)
    if (name && typeof name !== 'string') {
      logger.logValidation('name', 'Must be string');
      res.status(400).json({
        error: true,
        message: 'name must be a string'
      });
      return;
    }

    if (name && name.length > 255) {
      logger.logValidation('name', 'Exceeds 255 chars');
      res.status(400).json({
        error: true,
        message: 'name must not exceed 255 characters'
      });
      return;
    }

    // Validate relationship (optional but if provided, must be string)
    if (relationship && typeof relationship !== 'string') {
      logger.logValidation('relationship', 'Must be string');
      res.status(400).json({
        error: true,
        message: 'relationship must be a string'
      });
      return;
    }

    if (relationship && relationship.length > 50) {
      logger.logValidation('relationship', 'Exceeds 50 chars');
      res.status(400).json({
        error: true,
        message: 'relationship must not exceed 50 characters'
      });
      return;
    }

    logger.info('VALIDATION', 'Emergency contact validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Emergency contact validation error', { error: (error as Error).message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

export {
  validateSubmitReport,
  validateStatusRequest,
  validateSignup,
  validateLogin,
  validateOTP,
  validatePhoneChange,
  validateForgotPhone,
  validatePin,
  validatePanicMessage,
  validateEmergencyContact,
  isValidAddress,
  isValidPhone,
  isValidEmail
};
