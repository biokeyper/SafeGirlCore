/**
 * Key Recovery Routes
 * Manage encryption key backup and recovery
 */

const express = require('express');
const router = express.Router();

const keyRecoveryController = require('../controllers/keyRecoveryController');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

/**
 * POST /api/keys/backup
 * Backup encryption key with PIN
 * Protected: User must be authenticated
 */
router.post(
  '/backup',
  authMiddleware,
  async (req, res, next) => {
    try {
      await keyRecoveryController.backupKeyWithPin(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/keys/recover
 * Recover encryption key using PIN and phone
 * Rate limit: 5 attempts per 15 minutes per phone
 */
router.post(
  '/recover',
  rateLimit.limit(5, 15 * 60 * 1000),
  async (req, res, next) => {
    try {
      await keyRecoveryController.recoverKeyWithPin(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
