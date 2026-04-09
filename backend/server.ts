import "dotenv/config";

import express, { Express, Request, Response, NextFunction } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";

import logger from "./utils/logger";
import { validateEnvironment } from "./config/env";
import contractManager from "./config/contracts";
import eventListener from "./services/eventListener";
import ipfsService from "./services/ipfs";
import databaseService from "./services/database";
import bullMqService from "./services/bullMqService";
import bullMqConfirmationScheduler from "./services/bullMqConfirmationScheduler";
import bullMqSmsBatchProcessor from "./services/bullMqSmsBatchProcessor";
import bullMqSmsRetryProcessor from "./services/bullMqSmsRetryProcessor";
import bullMqPanicAlertProcessor from "./services/bullMqPanicAlertProcessor";

import reportRoutes from "./routes/reports";
import authRoutes from "./routes/auth";
import accessRoutes from "./routes/access";
import shareRoutes from "./routes/share";
import panicRoutes from "./routes/panic";
import emergencyRoutes from "./routes/emergency";
import searchRoutes from "./routes/search";
import notificationRoutes from "./routes/notifications";
import jobQueueRoutes from "./routes/jobQueue";
import userProfileRoutes from "./routes/userProfile";
import emailService from "./services/email";
import smsRetryProcessor from "./services/smsRetryProcessor";
import smsBatchProcessor from "./services/smsBatchProcessor";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestLogger, errorLogger } from "./middleware/requestLogger";

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Structured request/response logging with request IDs
app.use(requestLogger);

// Security headers middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: "deny",
  },
  noSniff: true,
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin",
  },
}));

app.use(bodyParser.json({ limit: process.env.MAX_PAYLOAD_SIZE || "10mb" }));
app.use(bodyParser.text());

// CORS whitelist - only allow frontend URLs
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://localhost:8080",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS policy violation"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "DELETE", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 3600, // Cache preflight for 1 hour
  }),
);

async function initializeServices(): Promise<boolean> {
  try {
    logger.logServer("Initializing services...");

    // 1. Initialize blockchain connection
    logger.logServer("Initializing blockchain connection...");
    const contractInitialized = await contractManager.initialize();
    if (!contractInitialized) {
      throw new Error("Failed to initialize contract manager");
    }

    // 2. Initialize IPFS service
    logger.logServer("Initializing IPFS service...");
    const ipfsInitialized = await ipfsService.initialize();
    if (!ipfsInitialized) {
      logger.warn(
        "SERVER",
        "IPFS initialization warning - may fail during upload",
      );
    }

    // 3. Initialize Database
    logger.logServer("Initializing database connection...");
    const dbInitialized = await databaseService.initialize();
    if (!dbInitialized) {
      logger.warn(
        "SERVER",
        "Database initialization warning - submissions will not be persisted",
      );
    }

    // 4. Initialize Email Service
    logger.logServer("Initializing email service...");
    const emailInitialized = await emailService.initialize();
    if (!emailInitialized) {
      logger.warn(
        "SERVER",
        "Email service not initialized - recovery emails will not be sent",
      );
    }

    // 5. Initialize BullMQ (Redis-backed job queues)
    logger.logServer("Initializing BullMQ job queues...");
    const bullMqInitialized = await bullMqService.initialize();
    if (!bullMqInitialized) {
      logger.warn(
        "SERVER",
        "BullMQ initialization warning - job queues not available (falling back to setInterval)",
      );
    }

    // 6. Initialize and start BullMQ confirmation scheduler
    if (bullMqInitialized) {
      logger.logServer("Starting BullMQ confirmation scheduler...");
      await bullMqConfirmationScheduler.initialize();
      await bullMqConfirmationScheduler.start();
    } else {
      // Fallback to old setInterval-based scheduler
      logger.logServer("Starting confirmation scheduler (fallback)...");
      const { start: startConfirmationScheduler } = await import("./services/confirmationScheduler");
      startConfirmationScheduler();
    }

    // 7. Initialize and start BullMQ SMS batch processor
    if (bullMqInitialized) {
      logger.logServer("Starting BullMQ SMS batch processor...");
      await bullMqSmsBatchProcessor.initialize();
      await bullMqSmsBatchProcessor.start();
    } else {
      // Fallback to old timer-based processor
      logger.logServer("Starting SMS batch processor (fallback)...");
    }

    // 8. Initialize and start BullMQ SMS retry processor
    if (bullMqInitialized) {
      logger.logServer("Starting BullMQ SMS retry processor...");
      await bullMqSmsRetryProcessor.initialize();
      await bullMqSmsRetryProcessor.start();
    } else {
      // Fallback to old setInterval-based processor
      logger.logServer("Starting SMS retry processor (fallback)...");
      smsRetryProcessor.start();
    }

    // 9. Initialize BullMQ panic alert processor
    if (bullMqInitialized) {
      logger.logServer("Initializing BullMQ panic alert processor...");
      await bullMqPanicAlertProcessor.initialize();
    }

    // 10. Start event listener (disabled - using database logging instead of blockchain filters)
    // logger.logServer('Starting event listener...');
    // await eventListener.startListening();

    logger.success("SERVER", "All services initialized successfully");
    return true;
  } catch (error) {
    if (error instanceof Error) {
      logger.error("SERVER", "Service initialization failed", {
        error: error.message,
      });
    }
    return false;
  }
}

app.use("/api", reportRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/access", accessRoutes);
app.use("/api/share", shareRoutes);
app.use("/api/panic-alert", panicRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/user/profile", userProfileRoutes);
app.use("/api/jobs", jobQueueRoutes);

app.get("/", (req: Request, res: Response) => {
  logger.logRequest("GET", "/");
  res.json({
    name: "SafeGirl Backend API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      auth: {
        signup: "POST /api/auth/signup",
        login: "POST /api/auth/login",
        verify: "GET /api/auth/verify (protected)",
      },
      reports: {
        submit: "POST /api/submitReport",
        status: "GET /api/reportStatus",
        health: "GET /api/health",
      },
    },
  });
});

/**
 * Health Check Endpoint
 * Used by load balancers and monitoring systems to determine service health
 * Returns status of all critical components
 */
app.get("/api/health", async (req: Request, res: Response) => {
  try {
    logger.debug("HEALTH", "Health check requested");

    const startTime = Date.now();

    // Check database health
    let databaseHealthy = false;
    try {
      databaseHealthy = await (databaseService as any).ping();
    } catch (error) {
      logger.warn("HEALTH", "Database health check failed", {
        error: (error as Error).message,
      });
    }

    // Check blockchain connectivity
    let blockchainHealthy = false;
    try {
      // Simple check: provider should be connected
      const provider = (contractManager as any)?.provider;
      blockchainHealthy = !!provider && typeof provider.getBlockNumber === "function";
    } catch (error) {
      logger.warn("HEALTH", "Blockchain health check failed", {
        error: (error as Error).message,
      });
    }

    // Check IPFS connectivity
    let ipfsHealthy = false;
    try {
      ipfsHealthy = (ipfsService as any)?.isConnected?.() || false;
    } catch (error) {
      logger.warn("HEALTH", "IPFS health check failed", {
        error: (error as Error).message,
      });
    }

    // Get database pool stats for monitoring
    const poolStats = (databaseService as any).getPoolStats?.();

    // Determine overall health status
    let overallStatus = "healthy";
    if (!databaseHealthy) {
      overallStatus = "unhealthy"; // Database is critical
    } else if (!blockchainHealthy || !ipfsHealthy) {
      overallStatus = "degraded"; // Non-critical services failing
    }

    const responseTime = Date.now() - startTime;

    const healthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      components: {
        database: databaseHealthy,
        blockchain: blockchainHealthy,
        ipfs: ipfsHealthy,
      },
      poolStats: poolStats || undefined,
    };

    // Log health check result
    if (overallStatus === "healthy") {
      logger.debug("HEALTH", "Health check passed", { responseTime });
    } else {
      logger.warn("HEALTH", `Health check ${overallStatus}`, healthResponse);
    }

    // Return appropriate status code
    const statusCode = overallStatus === "healthy" ? 200 : 503;
    res.status(statusCode).json(healthResponse);
  } catch (error) {
    logger.error("HEALTH", "Health check endpoint error", {
      error: (error as Error).message,
    });

    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      message: "Health check failed",
      error: (error as Error).message,
    });
  }
});

app.use(notFoundHandler);

// Error logging middleware (logs unhandled errors with request context)
app.use(errorLogger);

app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    // Validate environment variables early
    validateEnvironment();

    // Initialize services
    const servicesReady = await initializeServices();

    if (!servicesReady) {
      logger.warn("SERVER", "Services not fully ready, but starting anyway");
    }

    // Start listening
    const server = app.listen(PORT, () => {
      logger.success("SERVER", `Server started`, {
        url: `http://localhost:${PORT}`,
        env: process.env.NODE_ENV || "development",
      });

      logger.logServer("API Endpoints:");
      logger.logServer("  AUTH (OTP-based):");
      logger.logServer(
        "    POST   /api/auth/signup/initiate        - Signup Step 1: Send OTP",
      );
      logger.logServer(
        "    POST   /api/auth/signup/verify          - Signup Step 2: Verify OTP",
      );
      logger.logServer(
        "    POST   /api/auth/login/initiate         - Login Step 1: Send OTP",
      );
      logger.logServer(
        "    POST   /api/auth/login/verify           - Login Step 2: Verify OTP",
      );
      logger.logServer(
        "    POST   /api/auth/forgot-phone           - Recovery Step 1: Send token",
      );
      logger.logServer(
        "    POST   /api/auth/verify-recovery        - Recovery Step 2: Verify token",
      );
      logger.logServer(
        "    POST   /api/auth/change-phone/recovery  - Recovery Step 3: Send OTP",
      );
      logger.logServer(
        "    POST   /api/auth/verify-phone-change/recovery - Recovery Step 4: Verify",
      );
      logger.logServer(
        "    POST   /api/auth/change-phone           - Change phone (authenticated)",
      );
      logger.logServer(
        "    POST   /api/auth/verify-phone-change    - Verify phone change",
      );
      logger.logServer(
        "    GET    /api/auth/verify                 - Verify token (protected)",
      );
      logger.logServer("");
      logger.logServer("  REPORTS:");
      logger.logServer(
        "    POST   /api/submitReport            - Submit report (backend encrypts)",
      );
      logger.logServer(
        "    GET    /api/reportStatus            - Check report status",
      );
      logger.logServer(
        "    GET    /api/report/:reportId/decrypt - Decrypt and view report (protected)",
      );
      logger.logServer(
        "    GET    /api/health                  - Health check",
      );
      logger.logServer("");
      logger.logServer("  ACCESS (Report Sharing - Protected):");
      logger.logServer(
        "    POST   /api/access/grant                     - Grant access to a report",
      );
      logger.logServer(
        "    POST   /api/access/revoke                    - Revoke access from a report",
      );
      logger.logServer(
        "    GET    /api/access/shared-with-me            - Get reports shared with me",
      );
      logger.logServer(
        "    GET    /api/access/my-report/:reportId/viewers - Get viewers of my report",
      );
      logger.logServer(
        "    GET    /api/access/report/:reportId          - View a shared report",
      );
      logger.logServer("");
      logger.logServer("  SHARE (Phone-based Sharing with Deep Linking - Protected):");
      logger.logServer(
        "    POST   /api/share/generate                   - Generate shareable link",
      );
      logger.logServer(
        "    POST   /api/share/claim/:token               - Claim share link (after sign-in)",
      );
      logger.logServer(
        "    GET    /api/share/my-links                   - Get my share links",
      );
      logger.logServer(
        "    DELETE /api/share/revoke/:token              - Revoke share link",
      );
      logger.logServer(
        "    GET    /api/share/info/:token                - Get share link info (public)",
      );
      logger.logServer("");
      logger.logServer("  PANIC ALERTS (Protected - Rate Limited):");
      logger.logServer(
        "    POST   /api/panic-alert                      - Send emergency panic alert",
      );
      logger.logServer(
        "    GET    /api/panic-alert/history              - Get panic alert history",
      );
      logger.logServer("");
      logger.logServer("  SEARCH & FILTERING (Protected):");
      logger.logServer(
        "    GET    /api/search/reports                   - Search/filter reports",
      );
      logger.logServer(
        "    GET    /api/search/stats                     - Get report statistics",
      );
      logger.logServer("");
      logger.logServer("  NOTIFICATIONS (Protected):");
      logger.logServer(
        "    GET    /api/notifications                    - Get notifications",
      );
      logger.logServer(
        "    GET    /api/notifications/unread/count       - Get unread count",
      );
      logger.logServer(
        "    POST   /api/notifications/:id/read           - Mark as read",
      );
      logger.logServer(
        "    POST   /api/notifications/mark-all-read      - Mark all as read",
      );
      logger.logServer(
        "    DELETE /api/notifications/:id                - Delete notification",
      );
      logger.logServer("");
      logger.logServer("Logs saved to: backend/logs/");
    });

    return;
  } catch (error) {
    if (error instanceof Error) {
      logger.error("SERVER", "Failed to start server", {
        error: error.message,
      });
    }
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  logger.logServer("Shutdown signal received...");

  // Close BullMQ services
  await bullMqConfirmationScheduler.stop();
  await bullMqSmsBatchProcessor.stop();
  await bullMqSmsBatchProcessor.flushBatchImmediate();
  await bullMqSmsRetryProcessor.stop();
  await bullMqPanicAlertProcessor.stop();
  await bullMqService.close();

  // Fallback to old services if BullMQ wasn't available
  const { stop: stopConfirmationScheduler } = await import("./services/confirmationScheduler");
  stopConfirmationScheduler();
  smsRetryProcessor.stop();
  await smsBatchProcessor.flushBatchImmediate();

  eventListener.stopListening();
  await databaseService.close();
  logger.logServer("Server stopped");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.logServer("Termination signal received...");

  // Close BullMQ services
  await bullMqConfirmationScheduler.stop();
  await bullMqSmsBatchProcessor.stop();
  await bullMqSmsBatchProcessor.flushBatchImmediate();
  await bullMqSmsRetryProcessor.stop();
  await bullMqPanicAlertProcessor.stop();
  await bullMqService.close();

  // Fallback to old services if BullMQ wasn't available
  const { stop: stopConfirmationScheduler } = await import("./services/confirmationScheduler");
  stopConfirmationScheduler();
  smsRetryProcessor.stop();
  await smsBatchProcessor.flushBatchImmediate();

  eventListener.stopListening();
  await databaseService.close();
  logger.logServer("Server stopped");
  process.exit(0);
});

// Start!
startServer();
