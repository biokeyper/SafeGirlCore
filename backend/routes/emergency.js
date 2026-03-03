/**
 * Emergency Contacts Routes
 * Endpoints for managing emergency contacts and panic messages
 */

const express = require('express');
const router = express.Router();

const panicController = require('../controllers/panicController');
const authMiddleware = require('../middleware/auth');
const { validatePanicMessage, validateEmergencyContact } = require('../middleware/validation');

/**
 * All emergency routes require authentication
 */
router.use(authMiddleware);

/**
 * POST /api/emergency/set-panic-message
 * Set custom panic message sent to emergency contacts
 */
router.post('/set-panic-message', validatePanicMessage, async (req, res, next) => {
  try {
    await panicController.setPanicMessage(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/emergency/panic-message
 * Get current panic message
 */
router.get('/panic-message', async (req, res, next) => {
  try {
    await panicController.getPanicMessage(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/emergency/add-contact
 * Add a new emergency contact
 * Body: { phone, name?, relationship? }
 */
router.post('/add-contact', validateEmergencyContact, async (req, res, next) => {
  try {
    await panicController.addEmergencyContact(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/emergency/contacts
 * Get all emergency contacts for user
 */
router.get('/contacts', async (req, res, next) => {
  try {
    await panicController.getEmergencyContacts(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/emergency/remove-contact/:contactId
 * Remove an emergency contact
 */
router.delete('/remove-contact/:contactId', async (req, res, next) => {
  try {
    await panicController.removeEmergencyContact(req, res, next);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
