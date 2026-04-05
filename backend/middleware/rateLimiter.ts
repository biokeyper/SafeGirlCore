/**
 * Rate Limiting Middleware
 * Protects auth endpoints from brute force and SMS bombing
 *
 * NOTE: Uses in-memory store. For production with multiple servers,
 * migrate to Redis-based store (redis-rate-limit or similar)
 */

import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import logger from "../utils/logger";

/**
 * Custom key generator for phone-based rate limiting
 * Uses phone number from request body
 */
const phoneBasedKeyGenerator = (req: Request): string => {
  const phone = req.body?.phone || "unknown";
  return `phone:${phone}`;
};

/**
 * Custom key generator for IP-based rate limiting
 * Uses client IP address
 */
const ipBasedKeyGenerator = (req: Request): string => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `ip:${ip}`;
};

/**
 * Rate limiter for OTP verification endpoints
 * 3 attempts per 5 minutes per phone number
 * Returns 429 (Too Many Requests)
 */
export const otpVerifyLimiter = rateLimit({
  keyGenerator: phoneBasedKeyGenerator,
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 attempts per window
  message: {
    error: true,
    message: "Too many OTP verification attempts. Please try again after 5 minutes.",
    code: "RATE_LIMIT_OTP_VERIFY",
    retryAfter: "5 minutes",
  },
  standardHeaders: false, // Don't return RateLimit-* headers
  legacyHeaders: false, // Don't return X-RateLimit-* headers
  skip: (req: Request) => {
    // Don't rate limit if no phone provided (will fail validation anyway)
    return !req.body?.phone;
  },
  handler: (req: Request, res: Response) => {
    logger.warn("RATE_LIMITER", "OTP verify rate limit exceeded", {
      phone: req.body?.phone,
      ip: req.ip,
    });

    res.status(429).json({
      error: true,
      message: "Too many OTP verification attempts. Please try again after 5 minutes.",
      code: "RATE_LIMIT_OTP_VERIFY",
      retryAfter: "5 minutes",
    });
  },
});

/**
 * Rate limiter for OTP initiation endpoints
 * 10 attempts per hour per IP address
 * Returns 429 (Too Many Requests)
 */
export const otpInitiateLimiter = rateLimit({
  keyGenerator: ipBasedKeyGenerator,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 attempts per window
  message: {
    error: true,
    message: "Too many OTP requests from this IP. Please try again after 1 hour.",
    code: "RATE_LIMIT_OTP_INITIATE",
    retryAfter: "1 hour",
  },
  standardHeaders: false,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn("RATE_LIMITER", "OTP initiate rate limit exceeded", {
      phone: req.body?.phone,
      ip: req.ip,
    });

    res.status(429).json({
      error: true,
      message: "Too many OTP requests from this IP. Please try again after 1 hour.",
      code: "RATE_LIMIT_OTP_INITIATE",
      retryAfter: "1 hour",
    });
  },
});

/**
 * Rate limiter for password recovery endpoints
 * 5 attempts per hour per IP address
 * Returns 429 (Too Many Requests)
 */
export const recoveryLimiter = rateLimit({
  keyGenerator: ipBasedKeyGenerator,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per window
  message: {
    error: true,
    message: "Too many recovery requests. Please try again after 1 hour.",
    code: "RATE_LIMIT_RECOVERY",
    retryAfter: "1 hour",
  },
  standardHeaders: false,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn("RATE_LIMITER", "Recovery rate limit exceeded", {
      email: req.body?.email,
      phone: req.body?.phone,
      ip: req.ip,
    });

    res.status(429).json({
      error: true,
      message: "Too many recovery requests. Please try again after 1 hour.",
      code: "RATE_LIMIT_RECOVERY",
      retryAfter: "1 hour",
    });
  },
});

/**
 * NOTE: Panic alerts are NOT rate-limited (safety critical)
 * Emergency endpoints should never be rate-limited
 */
