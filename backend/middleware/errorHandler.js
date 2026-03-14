/**
 * Error Handler Middleware
 * Catches errors and returns formatted responses
 */

const logger = require('../utils/logger');

/**
 * Global error handler middleware
 * Must be used last in Express setup: app.use(errorHandler)
 */
function errorHandler(err, req, res, next) {
  const errorResponse = {
    error: true,
    message: 'Internal server error',
    code: 'UNKNOWN_ERROR'
  };

  logger.error('ERROR_HANDLER', 'Unhandled error', {
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  if (err.message.includes('IPFS')) {
    errorResponse.code = 'IPFS_ERROR';
    errorResponse.message = 'Failed to upload to IPFS. Please try again.';
    return res.status(503).json(errorResponse);
  }

  if (err.message.includes('Network')) {
    errorResponse.code = 'NETWORK_ERROR';
    errorResponse.message = 'Network error. Please check your connection.';
    return res.status(503).json(errorResponse);
  }

  if (err.message.includes('Gas limit')) {
    errorResponse.code = 'GAS_ERROR';
    errorResponse.message = 'Transaction gas limit exceeded. Please try again later.';
    return res.status(400).json(errorResponse);
  }

  if (err.message.includes('Invalid address')) {
    errorResponse.code = 'INVALID_ADDRESS';
    errorResponse.message = 'Invalid blockchain address format.';
    return res.status(400).json(errorResponse);
  }

  if (err.message.includes('Timeout')) {
    errorResponse.code = 'TIMEOUT';
    errorResponse.message = 'Request timeout. Please try again.';
    return res.status(504).json(errorResponse);
  }

  if (err.code === 'ECONNREFUSED') {
    errorResponse.code = 'CONNECTION_REFUSED';
    errorResponse.message = 'Unable to connect to blockchain. Service may be down.';
    return res.status(503).json(errorResponse);
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json(errorResponse);
}

/**
 * Handle 404 errors
 */
function notFoundHandler(req, res) {
  logger.warn('API', 'Route not found', {
    method: req.method,
    path: req.path
  });

  res.status(404).json({
    error: true,
    message: 'Endpoint not found',
    path: req.path
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
