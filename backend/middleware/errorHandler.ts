/**
 * Error Handler Middleware
 * Catches errors and returns formatted responses
 */

import logger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * Global error handler middleware
 * Must be used last in Express setup: app.use(errorHandler)
 */
function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction): void {
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
    res.status(503).json(errorResponse);
    return;
  }

  if (err.message.includes('Network')) {
    errorResponse.code = 'NETWORK_ERROR';
    errorResponse.message = 'Network error. Please check your connection.';
    res.status(503).json(errorResponse);
    return;
  }

  if (err.message.includes('Gas limit')) {
    errorResponse.code = 'GAS_ERROR';
    errorResponse.message = 'Transaction gas limit exceeded. Please try again later.';
    res.status(400).json(errorResponse);
    return;
  }

  if (err.message.includes('Invalid address')) {
    errorResponse.code = 'INVALID_ADDRESS';
    errorResponse.message = 'Invalid blockchain address format.';
    res.status(400).json(errorResponse);
    return;
  }

  if (err.message.includes('Timeout')) {
    errorResponse.code = 'TIMEOUT';
    errorResponse.message = 'Request timeout. Please try again.';
    res.status(504).json(errorResponse);
    return;
  }

  if (err.code === 'ECONNREFUSED') {
    errorResponse.code = 'CONNECTION_REFUSED';
    errorResponse.message = 'Unable to connect to blockchain. Service may be down.';
    res.status(503).json(errorResponse);
    return;
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json(errorResponse);
}

/**
 * Handle 404 errors
 */
function notFoundHandler(req: Request, res: Response): void {
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

export {
  errorHandler,
  notFoundHandler
};
