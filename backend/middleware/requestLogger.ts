/**
 * Request/Response Logging Middleware
 * Logs all HTTP requests and responses with structured JSON format
 * Includes request IDs for distributed tracing
 */

import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { v4 as uuidv4 } from "uuid";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

/**
 * Generate or retrieve request ID
 */
function getRequestId(req: Request): string {
  const headerRequestId = req.headers["x-request-id"] as string;
  return headerRequestId || uuidv4();
}

/**
 * Extract user info from request (if authenticated)
 */
function extractUserInfo(req: Request): { userId?: string; phone?: string } {
  const user = (req as any).user;
  return {
    userId: user?.userId,
    phone: user?.phone,
  };
}

/**
 * Extract client IP address
 * Respects X-Forwarded-For header from proxies (Render, CloudFlare, etc)
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

/**
 * Sanitize URL to remove sensitive parameters
 */
function sanitizeUrl(url: string): string {
  const sensitiveParams = ["token", "password", "secret", "key", "otp", "code"];
  let sanitized = url;

  sensitiveParams.forEach((param) => {
    const regex = new RegExp(`(${param}=)[^&]*`, "gi");
    sanitized = sanitized.replace(regex, `$1***REDACTED***`);
  });

  return sanitized;
}

/**
 * Request/Response logging middleware
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate request ID
  const requestId = getRequestId(req);
  req.requestId = requestId;
  req.startTime = Date.now();

  // Add request ID to response headers
  res.setHeader("X-Request-ID", requestId);

  // Log incoming request
  const userInfo = extractUserInfo(req);
  const clientIp = getClientIp(req);
  const sanitizedUrl = sanitizeUrl(req.url);

  logger.info("HTTP_REQUEST", `${req.method} ${sanitizedUrl}`, {
    requestId,
    method: req.method,
    path: req.path,
    url: sanitizedUrl,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    clientIp,
    userAgent: req.headers["user-agent"],
    ...userInfo,
  });

  // Intercept response to log completion
  const originalSend = res.send;
  res.send = function (data: any) {
    const duration = Date.now() - req.startTime;
    const statusCode = res.statusCode;

    // Log response
    const logLevel = statusCode >= 400 ? "error" : "info";
    const logAction = statusCode >= 400 ? "HTTP_RESPONSE_ERROR" : "HTTP_RESPONSE";

    const logData: any = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode,
      duration: `${duration}ms`,
      ...userInfo,
    };

    // Log error response bodies for debugging
    if (statusCode >= 400 && typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        logData.error = parsed.error;
        logData.message = parsed.message;
      } catch {
        logData.errorBody = data.substring(0, 200); // First 200 chars
      }
    }

    if (logLevel === "error") {
      logger.error(logAction, `${req.method} ${req.path} - ${statusCode}`, logData);
    } else {
      logger.info(logAction, `${req.method} ${req.path} - ${statusCode}`, logData);
    }

    // Flag slow requests (> 1 second)
    if (duration > 1000) {
      logger.warn("SLOW_REQUEST", `${req.method} ${req.path} took ${duration}ms`, {
        requestId,
        duration,
        ...userInfo,
      });
    }

    return originalSend.call(this, data);
  };

  next();
}

/**
 * Error logging middleware
 * Logs unhandled errors
 */
export function errorLogger(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const duration = Date.now() - req.startTime;
  const userInfo = extractUserInfo(req);

  logger.error("HTTP_ERROR", `Unhandled error in ${req.method} ${req.path}`, {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    duration: `${duration}ms`,
    error: err.message,
    stack: err.stack?.substring(0, 500), // First 500 chars of stack
    statusCode: res.statusCode,
    ...userInfo,
  });

  // Let other error handlers process it
  next(err);
}
