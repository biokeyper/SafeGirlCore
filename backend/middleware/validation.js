/**
 * Validation Middleware
 * Validates incoming requests before processing
 */

const logger = require('../utils/logger');

/**
 * Validate submitReport request
 */
function validateSubmitReport(req, res, next) {
  try {
    const { encryptedPayload, responses, metadata } = req.body;

    // Check required fields
    if (!encryptedPayload) {
      logger.logValidation('encryptedPayload', 'Missing field');
      return res.status(400).json({
        error: true,
        message: 'Missing field: encryptedPayload'
      });
    }

    if (!responses || !Array.isArray(responses)) {
      logger.logValidation('responses', 'Must be an array');
      return res.status(400).json({
        error: true,
        message: 'Responses must be an array'
      });
    }

    // Validate responses count
    if (responses.length !== 5) {
      logger.logValidation('responses', `Expected 5, got ${responses.length}`);
      return res.status(400).json({
        error: true,
        message: 'Must provide exactly 5 responses'
      });
    }

    // Validate each response
    for (let i = 0; i < responses.length; i++) {
      if (typeof responses[i] !== 'string') {
        logger.logValidation(`responses[${i}]`, 'Must be a string');
        return res.status(400).json({
          error: true,
          message: `Response ${i} must be a string`
        });
      }

      if (responses[i].length > 500) {
        logger.logValidation(`responses[${i}]`, 'Exceeds 500 chars');
        return res.status(400).json({
          error: true,
          message: `Response ${i} exceeds 500 character limit`
        });
      }
    }

    // Validate payload size (max 10MB)
    const maxSize = parseInt(process.env.MAX_PAYLOAD_SIZE) || 10485760;
    if (encryptedPayload.length > maxSize) {
      logger.logValidation('encryptedPayload', `Size ${encryptedPayload.length} exceeds ${maxSize}`);
      return res.status(400).json({
        error: true,
        message: `Payload exceeds maximum size of ${maxSize} bytes`
      });
    }

    // Optional metadata validation
    if (metadata && typeof metadata !== 'object') {
      logger.logValidation('metadata', 'Must be an object');
      return res.status(400).json({
        error: true,
        message: 'Metadata must be an object'
      });
    }

    logger.info('VALIDATION', 'Submit report validated successfully');
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

module.exports = {
  validateSubmitReport,
  validateStatusRequest,
  isValidAddress
};
