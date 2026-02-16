/**
 * Rate Limiting Middleware
 * Prevents brute force attacks on sensitive endpoints
 */

const logger = require('../utils/logger');

class RateLimiter {
  constructor() {
    // In-memory store: { key: { count, resetTime } }
    this.store = new Map();
  }

  /**
   * Create a rate limiter for a specific endpoint
   * @param {number} maxAttempts - Max attempts allowed
   * @param {number} windowMs - Time window in milliseconds
   * @returns {function} Middleware function
   */
  limit(maxAttempts, windowMs) {
    return (req, res, next) => {
      // Create unique key: IP + path + specific identifier (phone, email, etc)
      let identifier = req.ip || req.connection.remoteAddress;

      // Add phone or email to key if available (for OTP/login attempts)
      if (req.body?.phone) {
        identifier += `-${req.body.phone}`;
      } else if (req.body?.email) {
        identifier += `-${req.body.email}`;
      }

      const key = `${req.path}:${identifier}`;
      const now = Date.now();

      // Get or create rate limit entry
      let entry = this.store.get(key);

      if (!entry || now > entry.resetTime) {
        // Reset if window expired
        entry = {
          count: 0,
          resetTime: now + windowMs
        };
        this.store.set(key, entry);
      }

      entry.count++;

      // Set response headers
      const remaining = Math.max(0, maxAttempts - entry.count);
      const resetTime = Math.ceil((entry.resetTime - now) / 1000);

      res.setHeader('X-RateLimit-Limit', maxAttempts);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTime);

      if (entry.count > maxAttempts) {
        logger.warn('RATE_LIMIT', `Rate limit exceeded: ${req.path}`, {
          identifier,
          attempts: entry.count,
          limit: maxAttempts
        });

        return res.status(429).json({
          error: true,
          message: `Too many requests. Try again in ${resetTime} seconds`,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: resetTime
        });
      }

      next();
    };
  }

  /**
   * Cleanup old entries (run periodically)
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

// Create singleton instance
const limiter = new RateLimiter();

// Cleanup every 5 minutes
setInterval(() => {
  limiter.cleanup();
}, 5 * 60 * 1000);

module.exports = limiter;
