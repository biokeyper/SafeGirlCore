/**
 * Panic Alert Routes
 * Emergency panic alert endpoints
 */

const express = require('express');
const router = express.Router();

const panicController = require('../controllers/panicController');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { validatePanicMessage, validateEmergencyContact } = require('../middleware/validation');

/**
 * All panic routes require authentication
 */
router.use(authMiddleware);

/**
 * POST /api/panic-alert
 * Send a panic alert
 * Rate limit: 10 attempts per minute (safety critical - user can spam in emergency)
 */
router.post(
  '/',
  rateLimit.limit(10, 60 * 1000),
  async (req, res, next) => {
    try {
      await panicController.sendPanicAlert(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/panic-alert/history
 * Get panic alert history
 * Protected: User can only see their own alerts
 */
router.get('/history', async (req, res, next) => {
  try {
    await panicController.getPanicHistory(req, res, next);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
