/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user info to request
 */

const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

function authMiddleware(req, res, next) {
  try {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      logger.error("AUTH", "JWT_SECRET is not configured");
      return res.status(500).json({
        error: true,
        message: "Server authentication is not configured",
        code: "SERVER_MISCONFIG",
      });
    }

    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("AUTH", "Missing or invalid Authorization header", {
        path: req.path,
      });
      return res.status(401).json({
        error: true,
        message: "Missing or invalid Authorization header",
      });
    }

    const token = authHeader.slice(7);

    const decoded = jwt.verify(token, jwtSecret);

    req.user = {
      userId: decoded.userId,
      phone: decoded.phone,
    };

    logger.info("AUTH", "Token verified", { userId: decoded.userId });
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      logger.warn("AUTH", "Token expired", { path: req.path });
      return res.status(401).json({
        error: true,
        message: "Token has expired",
        code: "TOKEN_EXPIRED",
      });
    }

    if (error.name === "JsonWebTokenError") {
      logger.warn("AUTH", "Invalid token", {
        path: req.path,
        error: error.message,
      });
      return res.status(401).json({
        error: true,
        message: "Invalid token",
        code: "INVALID_TOKEN",
      });
    }

    logger.error("AUTH", "Token verification failed", { error: error.message });
    return res.status(401).json({
      error: true,
      message: "Authentication failed",
    });
  }
}

module.exports = authMiddleware;
