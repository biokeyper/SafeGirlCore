
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const logger = require('./utils/logger');
const contractManager = require('./config/contracts');
const eventListener = require('./services/eventListener');
const ipfsService = require('./services/ipfs');
const databaseService = require('./services/database');

const reportRoutes = require('./routes/reports');
const authRoutes = require('./routes/auth');
const accessRoutes = require('./routes/access');
const panicRoutes = require('./routes/panic');
const emergencyRoutes = require('./routes/emergency');
const searchRoutes = require('./routes/search');
const notificationRoutes = require('./routes/notifications');
const emailService = require('./services/email');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;


// Log all incoming requests
app.use((req, res, next) => {
  logger.logRequest(req.method, req.path);
  next();
});

// Parse JSON bodies
app.use(bodyParser.json({ limit: process.env.MAX_PAYLOAD_SIZE || '10mb' }));
app.use(bodyParser.text());

app.use(cors({
  origin: '*', 
  credentials: true
}));

async function initializeServices() {
  try {
    logger.logServer('Initializing services...');

    // 1. Initialize blockchain connection
    logger.logServer('Initializing blockchain connection...');
    const contractInitialized = await contractManager.initialize();
    if (!contractInitialized) {
      throw new Error('Failed to initialize contract manager');
    }

    // 2. Initialize IPFS service
    logger.logServer('Initializing IPFS service...');
    const ipfsInitialized = await ipfsService.initialize();
    if (!ipfsInitialized) {
      logger.warn('SERVER', 'IPFS initialization warning - may fail during upload');
    }

    // 3. Initialize Database
    logger.logServer('Initializing database connection...');
    const dbInitialized = await databaseService.initialize();
    if (!dbInitialized) {
      logger.warn('SERVER', 'Database initialization warning - submissions will not be persisted');
    }

    // 4. Initialize Email Service
    logger.logServer('Initializing email service...');
    const emailInitialized = await emailService.initialize();
    if (!emailInitialized) {
      logger.warn('SERVER', 'Email service not initialized - recovery emails will not be sent');
    }

    // 5. Start event listener (disabled - using database logging instead of blockchain filters)
    // logger.logServer('Starting event listener...');
    // await eventListener.startListening();

    logger.success('SERVER', 'All services initialized successfully');
    return true;
  } catch (error) {
    logger.error('SERVER', 'Service initialization failed', {
      error: error.message
    });
    return false;
  }
}


app.use('/api', reportRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/panic-alert', panicRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/', (req, res) => {
  logger.logRequest('GET', '/');
  res.json({
    name: 'SafeGirl Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: {
        signup: 'POST /api/auth/signup',
        login: 'POST /api/auth/login',
        verify: 'GET /api/auth/verify (protected)'
      },
      reports: {
        submit: 'POST /api/submitReport',
        status: 'GET /api/reportStatus',
        health: 'GET /api/health'
      }
    }
  });
});


app.use(notFoundHandler);

app.use(errorHandler);

async function startServer() {
  try {
    // Initialize services
    const servicesReady = await initializeServices();

    if (!servicesReady) {
      logger.warn('SERVER', 'Services not fully ready, but starting anyway');
    }

    // Start listening
    app.listen(PORT, () => {
      logger.success('SERVER', `Server started`, {
        url: `http://localhost:${PORT}`,
        env: process.env.NODE_ENV || 'development'
      });

      logger.logServer('API Endpoints:');
      logger.logServer('  AUTH (OTP-based):');
      logger.logServer('    POST   /api/auth/signup/initiate        - Signup Step 1: Send OTP');
      logger.logServer('    POST   /api/auth/signup/verify          - Signup Step 2: Verify OTP');
      logger.logServer('    POST   /api/auth/login/initiate         - Login Step 1: Send OTP');
      logger.logServer('    POST   /api/auth/login/verify           - Login Step 2: Verify OTP');
      logger.logServer('    POST   /api/auth/forgot-phone           - Recovery Step 1: Send token');
      logger.logServer('    POST   /api/auth/verify-recovery        - Recovery Step 2: Verify token');
      logger.logServer('    POST   /api/auth/change-phone/recovery  - Recovery Step 3: Send OTP');
      logger.logServer('    POST   /api/auth/verify-phone-change/recovery - Recovery Step 4: Verify');
      logger.logServer('    POST   /api/auth/change-phone           - Change phone (authenticated)');
      logger.logServer('    POST   /api/auth/verify-phone-change    - Verify phone change');
      logger.logServer('    GET    /api/auth/verify                 - Verify token (protected)');
      logger.logServer('');
      logger.logServer('  REPORTS:');
      logger.logServer('    POST   /api/submitReport            - Submit report (backend encrypts)');
      logger.logServer('    GET    /api/reportStatus            - Check report status');
      logger.logServer('    GET    /api/report/:reportId/decrypt - Decrypt and view report (protected)');
      logger.logServer('    GET    /api/health                  - Health check');
      logger.logServer('');
      logger.logServer('  ACCESS (Report Sharing - Protected):');
      logger.logServer('    POST   /api/access/grant                     - Grant access to a report');
      logger.logServer('    POST   /api/access/revoke                    - Revoke access from a report');
      logger.logServer('    GET    /api/access/shared-with-me            - Get reports shared with me');
      logger.logServer('    GET    /api/access/my-report/:reportId/viewers - Get viewers of my report');
      logger.logServer('    GET    /api/access/report/:reportId          - View a shared report');
      logger.logServer('');
      logger.logServer('  PANIC ALERTS (Protected - Rate Limited):');
      logger.logServer('    POST   /api/panic-alert                      - Send emergency panic alert');
      logger.logServer('    GET    /api/panic-alert/history              - Get panic alert history');
      logger.logServer('');
      logger.logServer('  KEY RECOVERY:');
      logger.logServer('    POST   /api/keys/backup                      - Backup encryption key with PIN (protected)');
      logger.logServer('    POST   /api/keys/recover                     - Recover key using PIN + phone (rate limited)');
      logger.logServer('');
      logger.logServer('  SEARCH & FILTERING (Protected):');
      logger.logServer('    GET    /api/search/reports                   - Search/filter reports');
      logger.logServer('    GET    /api/search/stats                     - Get report statistics');
      logger.logServer('');
      logger.logServer('  NOTIFICATIONS (Protected):');
      logger.logServer('    GET    /api/notifications                    - Get notifications');
      logger.logServer('    GET    /api/notifications/unread/count       - Get unread count');
      logger.logServer('    POST   /api/notifications/:id/read           - Mark as read');
      logger.logServer('    POST   /api/notifications/mark-all-read      - Mark all as read');
      logger.logServer('    DELETE /api/notifications/:id                - Delete notification');
      logger.logServer('');
      logger.logServer('Logs saved to: backend/logs/');
    });
  } catch (error) {
    logger.error('SERVER', 'Failed to start server', {
      error: error.message
    });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.logServer('Shutdown signal received...');
  eventListener.stopListening();
  await databaseService.close();
  logger.logServer('Server stopped');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.logServer('Termination signal received...');
  eventListener.stopListening();
  await databaseService.close();
  logger.logServer('Server stopped');
  process.exit(0);
});

// Start!
startServer();
