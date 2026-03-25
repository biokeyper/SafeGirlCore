/**
 * Emergency Contacts Routes
 * Endpoints for managing emergency contacts and panic messages
 */

import express, { Request, Response, NextFunction } from 'express';
const router = express.Router();

import panicController from '../controllers/panicController';
import authMiddleware from '../middleware/auth';
import { validatePanicMessage, validateEmergencyContact } from '../middleware/validation';

/**
 * All emergency routes require authentication
 */
router.use(authMiddleware);

/**
 * POST /api/emergency/set-panic-message
 * Set custom panic message sent to emergency contacts
 */
router.post('/set-panic-message', validatePanicMessage, async (req: Request, res: Response, next: NextFunction) => {
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
router.get('/panic-message', async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/add-contact', validateEmergencyContact, async (req: Request, res: Response, next: NextFunction) => {
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
router.get('/contacts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await panicController.getEmergencyContacts(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/emergency/edit-contact/:contactId
 * Edit an emergency contact's details
 * Body: { phone?, name?, relationship? }
 */
router.put('/edit-contact/:contactId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await panicController.editEmergencyContact(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/emergency/remove-contact/:contactId
 * Remove an emergency contact
 */
router.delete('/remove-contact/:contactId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await panicController.removeEmergencyContact(req, res, next);
  } catch (error) {
    next(error);
  }
});

export default router;
