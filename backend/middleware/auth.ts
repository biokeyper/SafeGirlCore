/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user info to request
 * Supports secret rotation via JWT_SECRET_PREVIOUS
 */

import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { AuthenticatedRequest, JwtPayload } from '../types/index';
import { Response, NextFunction } from 'express';
import { getJwtService } from '../services/jwtService';

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('AUTH', 'Missing or invalid Authorization header', {
        path: req.path,
      });
      res.status(401).json({
        error: true,
        message: 'Missing or invalid Authorization header',
      });
      return;
    }

    const token = authHeader.slice(7);

    // Use JWT service for verification (supports rotation)
    const jwtService = getJwtService();
    const decoded = jwtService.verify(token) as JwtPayload;

    req.user = {
      userId: decoded.userId,
      phone: decoded.phone,
      email: decoded.email,
      country: decoded.country,
    };

    logger.info('AUTH', 'Token verified', { userId: decoded.userId });
    next();
  } catch (error) {
    const err = error as jwt.JsonWebTokenError & { name: string };

    if (err.name === 'TokenExpiredError') {
      logger.warn('AUTH', 'Token expired', { path: req.path });
      res.status(401).json({
        error: true,
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }

    if (err.name === 'JsonWebTokenError') {
      logger.warn('AUTH', 'Invalid token', {
        path: req.path,
        error: err.message,
      });
      res.status(401).json({
        error: true,
        message: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
      return;
    }

    logger.error('AUTH', 'Token verification failed', { error: (error as Error).message });
    res.status(401).json({
      error: true,
      message: 'Authentication failed',
    });
  }
}

export default authMiddleware;
