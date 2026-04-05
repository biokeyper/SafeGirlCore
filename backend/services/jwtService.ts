/**
 * JWT Service with Secret Rotation Support
 *
 * Handles JWT signing and verification with key rotation:
 * - Signs new tokens with current secret only
 * - Verifies with current secret first, then previous secret (if exists)
 * - Enables seamless secret rotation without invalidating existing tokens
 *
 * Rotation Flow:
 * 1. Generate new secret
 * 2. Set JWT_SECRET_PREVIOUS = old value
 * 3. Set JWT_SECRET = new value
 * 4. Deploy
 * 5. Old tokens (signed with previous secret) still work for 7 days
 * 6. New tokens signed with new secret
 * 7. After 7 days, users auto re-login with new secret
 * 8. Remove JWT_SECRET_PREVIOUS (optional cleanup)
 */

import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { JwtPayload } from '../types/index';

interface JwtSignPayload {
  userId: string;
  phone: string;
  email?: string | null;
  country: string;
}

class JwtService {
  private currentSecret: string;
  private previousSecret?: string;

  constructor(currentSecret: string, previousSecret?: string) {
    if (!currentSecret) {
      throw new Error('JWT_SECRET is required');
    }
    this.currentSecret = currentSecret;
    this.previousSecret = previousSecret;

    if (previousSecret) {
      logger.info('JWT_SERVICE', 'Initialized with secret rotation enabled');
    }
  }

  /**
   * Sign a new JWT token with current secret
   * Always uses current secret for new tokens
   */
  sign(payload: JwtSignPayload, expiresIn: string = '7d'): string {
    try {
      const token = jwt.sign(payload, this.currentSecret, { expiresIn } as any);
      return token;
    } catch (error) {
      logger.error('JWT_SERVICE', 'Failed to sign token', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Verify a JWT token
   * Tries current secret first, then previous secret (if rotation enabled)
   * This allows old tokens to work during rotation period
   */
  verify(token: string): JwtPayload {
    // Try current secret first
    try {
      const decoded = jwt.verify(token, this.currentSecret) as JwtPayload;
      return decoded;
    } catch (error) {
      const err = error as jwt.JsonWebTokenError;

      // If token is expired or invalid structure, fail immediately
      if (err.name === 'TokenExpiredError') {
        throw error;
      }

      // If we have a previous secret and current secret failed, try previous
      if (this.previousSecret) {
        try {
          logger.debug('JWT_SERVICE', 'Current secret failed, trying previous secret');
          const decoded = jwt.verify(token, this.previousSecret) as JwtPayload;
          logger.info('JWT_SERVICE', 'Token verified with previous secret (rotation in progress)');
          return decoded;
        } catch (prevError) {
          // Both failed, throw the original error
          throw error;
        }
      }

      // No previous secret and current failed
      throw error;
    }
  }

  /**
   * Check if secret rotation is active
   * Used for logging/monitoring
   */
  isRotationActive(): boolean {
    return !!this.previousSecret;
  }

  /**
   * Get rotation status for monitoring
   */
  getStatus(): {
    hasCurrentSecret: boolean;
    hasPreviousSecret: boolean;
    rotationActive: boolean;
  } {
    return {
      hasCurrentSecret: !!this.currentSecret,
      hasPreviousSecret: !!this.previousSecret,
      rotationActive: this.isRotationActive(),
    };
  }
}

/**
 * Initialize JWT service with secrets from environment
 */
function initializeJwtService(): JwtService {
  const currentSecret = process.env.JWT_SECRET;
  const previousSecret = process.env.JWT_SECRET_PREVIOUS;

  if (!currentSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  return new JwtService(currentSecret, previousSecret);
}

// Singleton instance
let jwtService: JwtService;

function getJwtService(): JwtService {
  if (!jwtService) {
    jwtService = initializeJwtService();
  }
  return jwtService;
}

export { JwtService, getJwtService, JwtSignPayload };
export default getJwtService();
