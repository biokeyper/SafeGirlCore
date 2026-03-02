/**
 * Validation Middleware
 * Validates incoming requests before processing
 */

const logger = require('../utils/logger');

/**
 * Validate submitReport request
 * Backend encryption: Frontend sends unencrypted JSON data
 * Backend encrypts before IPFS upload
 */
function validateSubmitReport(req, res, next) {
  try {
    const { payload, responses, metadata } = req.body;

    // Check required fields
    if (!payload) {
      logger.logValidation('payload', 'Missing field');
      return res.status(400).json({
        error: true,
        message: 'Missing field: payload (must be JSON object with report data)'
      });
    }

    // Payload must be a JSON object (not encrypted hex)
    if (typeof payload !== 'object' || payload === null) {
      logger.logValidation('payload', 'Must be a JSON object');
      return res.status(400).json({
        error: true,
        message: 'payload must be a JSON object'
      });
    }

    // Responses are optional (frontend can send text, audio, or both)
    if (responses && Array.isArray(responses)) {
      // If responses provided, validate each one
      for (let i = 0; i < responses.length; i++) {
        if (typeof responses[i] !== 'string') {
          logger.logValidation(`responses[${i}]`, 'Must be a string');
          return res.status(400).json({
            error: true,
            message: `Response ${i} must be a string`
          });
        }

        if (responses[i].length > 1000) {
          logger.logValidation(`responses[${i}]`, 'Exceeds 1000 chars');
          return res.status(400).json({
            error: true,
            message: `Response ${i} exceeds 1000 character limit`
          });
        }
      }
    }

    // Optional metadata validation
    if (metadata && typeof metadata !== 'object') {
      logger.logValidation('metadata', 'Must be an object');
      return res.status(400).json({
        error: true,
        message: 'Metadata must be an object'
      });
    }

    logger.info('VALIDATION', 'Submit report validated successfully', {
      hasPayload: !!payload,
      hasResponses: !!responses,
      hasMetadata: !!metadata
    });
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Validation error', { error: error.message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate status check request
 */
function validateStatusRequest(req, res, next) {
  try {
    const { reportId } = req.query;

    if (!reportId || typeof reportId !== 'string') {
      logger.logValidation('reportId', 'Missing or invalid');
      return res.status(400).json({
        error: true,
        message: 'Query parameter "reportId" is required'
      });
    }

    if (reportId.length > 256) {
      logger.logValidation('reportId', 'Exceeds 256 chars');
      return res.status(400).json({
        error: true,
        message: 'reportId exceeds maximum length'
      });
    }

    logger.info('VALIDATION', 'Status request validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Validation error', { error: error.message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate wallet address format
 */
function isValidAddress(address) {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate phone format
 * @private
 */
function isValidPhone(phone) {
  // Allow: +254712345678, 0712345678, 254712345678
  // Min 10 digits, max 15 (E.164 standard)
  const phoneDigitsOnly = phone.replace(/\D/g, '');
  return phoneDigitsOnly.length >= 10 && phoneDigitsOnly.length <= 15;
}

/**
 * Validate email format
 * @private
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return email && email.length <= 255 && emailRegex.test(email);
}

/**
 * Validate signup initiation request (OTP-based, phone only)
 */
function validateSignup(req, res, next) {
  try {
    const { phone } = req.body;

    // Validate phone
    if (!phone || typeof phone !== 'string') {
      logger.logValidation('phone', 'Missing or invalid');
      return res.status(400).json({
        error: true,
        message: 'phone is required and must be a string'
      });
    }

    if (!isValidPhone(phone)) {
      logger.logValidation('phone', 'Invalid format');
      return res.status(400).json({
        error: true,
        message: 'Phone number must contain 10-15 digits'
      });
    }

    logger.info('VALIDATION', 'Signup request validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Signup validation error', { error: error.message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate login initiation request (phone only)
 */
function validateLogin(req, res, next) {
  try {
    const { phone } = req.body;

    // Validate phone
    if (!phone || typeof phone !== 'string') {
      logger.logValidation('phone', 'Missing or invalid');
      return res.status(400).json({
        error: true,
        message: 'phone is required and must be a string'
      });
    }

    if (!isValidPhone(phone)) {
      logger.logValidation('phone', 'Invalid format');
      return res.status(400).json({
        error: true,
        message: 'Phone number must contain 10-15 digits'
      });
    }

    logger.info('VALIDATION', 'Login request validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Login validation error', { error: error.message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate OTP verification request
 */
function validateOTP(req, res, next) {
  try {
    const { phone, otp } = req.body;

    // Validate OTP
    if (!otp || typeof otp !== 'string') {
      logger.logValidation('otp', 'Missing or invalid');
      return res.status(400).json({
        error: true,
        message: 'otp is required'
      });
    }

    // OTP should be 6 digits
    if (!/^\d{6}$/.test(otp)) {
      logger.logValidation('otp', 'Invalid format');
      return res.status(400).json({
        error: true,
        message: 'OTP must be 6 digits'
      });
    }

    // For signup or login verification, require phone
    if (req.path.includes('signup/verify') || req.path.includes('login/verify')) {
      if (!phone) {
        logger.logValidation('phone', 'Missing for OTP verification');
        return res.status(400).json({
          error: true,
          message: 'phone is required'
        });
      }
    }

    logger.info('VALIDATION', 'OTP validation successful');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'OTP validation error', { error: error.message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate phone change request
 */
function validatePhoneChange(req, res, next) {
  try {
    const { newPhone } = req.body;

    if (!newPhone || typeof newPhone !== 'string') {
      logger.logValidation('newPhone', 'Missing or invalid');
      return res.status(400).json({
        error: true,
        message: 'newPhone is required'
      });
    }

    if (!isValidPhone(newPhone)) {
      logger.logValidation('newPhone', 'Invalid format');
      return res.status(400).json({
        error: true,
        message: 'Phone number must contain 10-15 digits'
      });
    }

    logger.info('VALIDATION', 'Phone change request validated');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Phone change validation error', { error: error.message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate forgot phone request
 */
function validateForgotPhone(req, res, next) {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      logger.logValidation('email', 'Missing or invalid');
      return res.status(400).json({
        error: true,
        message: 'email is required'
      });
    }

    if (!isValidEmail(email)) {
      logger.logValidation('email', 'Invalid format');
      return res.status(400).json({
        error: true,
        message: 'Invalid email format'
      });
    }

    logger.info('VALIDATION', 'Forgot phone request validated');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Forgot phone validation error', { error: error.message });
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
function validatePin(req, res, next) {
  try {
    const { pin } = req.body;

    if (!pin) {
      logger.logValidation('pin', 'Missing field');
      return res.status(400).json({
        error: true,
        message: 'pin is required'
      });
    }

    if (!/^\d{1,6}$/.test(pin)) {
      logger.logValidation('pin', 'Invalid format');
      return res.status(400).json({
        error: true,
        message: 'pin must be 1-6 digits'
      });
    }

    logger.info('VALIDATION', 'PIN validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'PIN validation error', { error: error.message });
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
function validatePanicMessage(req, res, next) {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      logger.logValidation('message', 'Missing or invalid');
      return res.status(400).json({
        error: true,
        message: 'message is required and must be a string'
      });
    }

    if (message.trim().length === 0) {
      logger.logValidation('message', 'Empty message');
      return res.status(400).json({
        error: true,
        message: 'message cannot be empty'
      });
    }

    if (message.length > 255) {
      logger.logValidation('message', 'Exceeds 255 chars');
      return res.status(400).json({
        error: true,
        message: 'message must not exceed 255 characters'
      });
    }

    logger.info('VALIDATION', 'Panic message validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Panic message validation error', { error: error.message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

/**
 * Validate emergency contact (phone + optional relationship)
 */
function validateEmergencyContact(req, res, next) {
  try {
    const { phone, name, relationship } = req.body;

    // Validate phone
    if (!phone || typeof phone !== 'string') {
      logger.logValidation('phone', 'Missing or invalid');
      return res.status(400).json({
        error: true,
        message: 'phone is required and must be a string'
      });
    }

    if (!isValidPhone(phone)) {
      logger.logValidation('phone', 'Invalid format');
      return res.status(400).json({
        error: true,
        message: 'Phone number must contain 10-15 digits'
      });
    }

    // Validate name (optional but if provided, must be string)
    if (name && typeof name !== 'string') {
      logger.logValidation('name', 'Must be string');
      return res.status(400).json({
        error: true,
        message: 'name must be a string'
      });
    }

    if (name && name.length > 255) {
      logger.logValidation('name', 'Exceeds 255 chars');
      return res.status(400).json({
        error: true,
        message: 'name must not exceed 255 characters'
      });
    }

    // Validate relationship (optional but if provided, must be string)
    if (relationship && typeof relationship !== 'string') {
      logger.logValidation('relationship', 'Must be string');
      return res.status(400).json({
        error: true,
        message: 'relationship must be a string'
      });
    }

    if (relationship && relationship.length > 50) {
      logger.logValidation('relationship', 'Exceeds 50 chars');
      return res.status(400).json({
        error: true,
        message: 'relationship must not exceed 50 characters'
      });
    }

    logger.info('VALIDATION', 'Emergency contact validated successfully');
    next();
  } catch (error) {
    logger.error('VALIDATION', 'Emergency contact validation error', { error: error.message });
    res.status(500).json({
      error: true,
      message: 'Validation error'
    });
  }
}

module.exports = {
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
