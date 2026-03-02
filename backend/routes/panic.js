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

/**
 * EMERGENCY CONTACTS MANAGEMENT
 */

/**
 * POST /api/emergency/set-panic-message
 * Set custom panic message sent to emergency contacts
 * Protected: Authenticated users only
 */
router.post('/set-panic-message', authMiddleware, validatePanicMessage, async (req, res, next) => {
  try {
    await panicController.setPanicMessage(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/emergency/panic-message
 * Get current panic message
 * Protected: Authenticated users only
 */
router.get('/panic-message', authMiddleware, async (req, res, next) => {
  try {
    await panicController.getPanicMessage(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/emergency/add-contact
 * Add a new emergency contact
 * Protected: Authenticated users only
 * Body: { phone, name?, relationship? }
 */
router.post('/add-contact', authMiddleware, validateEmergencyContact, async (req, res, next) => {
  try {
    await panicController.addEmergencyContact(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/emergency/contacts
 * Get all emergency contacts for user
 * Protected: Authenticated users only
 */
router.get('/contacts', authMiddleware, async (req, res, next) => {
  try {
    await panicController.getEmergencyContacts(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/emergency/remove-contact/:contactId
 * Remove an emergency contact
 * Protected: Authenticated users only
 */
router.delete('/remove-contact/:contactId', authMiddleware, async (req, res, next) => {
  try {
    await panicController.removeEmergencyContact(req, res, next);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
