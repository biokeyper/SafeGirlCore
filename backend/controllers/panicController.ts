/**
 * Panic Alert Controller
 * Handles emergency panic alerts and emergency contacts
 */

import { Request, Response, NextFunction } from "express";
import blockchainService from "../services/blockchain";
import databaseService from "../services/database";
import emailService from "../services/email";
import logger from "../utils/logger";

class PanicController {
  /**
   * Normalize phone number to E.164 format (+COUNTRYCODEXXXXXXXXX)
   * Removes spaces, dashes, and other non-digits
   * Converts local format (0XXXXXXXXX) to international
   * @private
   */
  private normalizePhoneNumber(phone: string | null | undefined): string | null {
    if (!phone) return null;

    // Remove all non-digit characters (spaces, dashes, etc.)
    let normalized = phone.replace(/\D/g, "");

    // If starts with 0 (local format), replace with country code from env
    if (normalized.startsWith("0")) {
      const countryCode = process.env.COUNTRY_CODE || "256"; // Default to Uganda
      normalized = countryCode + normalized.substring(1);
    }

    // Ensure it has the + prefix for E.164 format
    if (!normalized.startsWith("+")) {
      normalized = "+" + normalized;
    }

    logger.debug("PANIC", "Phone normalized", {
      original: phone,
      normalized,
    });

    return normalized;
  }

  /**
   * Send panic alert
   * POST /api/panic-alert
   *
   * Body:
   * {
   *   "locationData": "GPS coordinates or address"
   * }
   */
  async sendPanicAlert(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    let alertId: number | null = null;

    try {
      const { locationData } = req.body;
      const userId = req.user?.userId;

      logger.logRequest("POST", "/api/panic-alert", {
        userId,
        hasLocation: !!locationData,
      });

      if (!userId) {
        logger.warn("PANIC", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      if (!locationData || typeof locationData !== "string") {
        logger.warn("PANIC", "Missing or invalid location data", { userId });
        res.status(400).json({
          error: true,
          message: "locationData is required (string)",
        });
        return;
      }

      if (locationData.length > 500) {
        logger.warn("PANIC", "Location data too long", { userId });
        res.status(400).json({
          error: true,
          message: "locationData exceeds 500 character limit",
        });
        return;
      }

      logger.info("PANIC", "Processing panic alert (NON-BLOCKING)", {
        userId,
        locationLength: locationData.length,
      });

      // ========== STEP 1: Save to database immediately (fast) ==========
      const walletAddress = blockchainService.getWalletAddress();

      const alertRecord = await (databaseService as any).savePanicAlert({
        userId,
        walletAddress,
        locationData,
        txHash: null, // Will be updated after blockchain confirmation
        blockNumber: null,
      });

      alertId = alertRecord.id;

      logger.success("PANIC", "Panic alert saved to database immediately", {
        userId,
        alertId,
        status: "pending",
      });

      // ========== STEP 1.5: Create notification for user ==========
      await (databaseService as any).createNotification({
        userId,
        type: "panic_alert",
        title: "Panic Alert Sent",
        message:
          "Your emergency panic alert has been sent. Emergency contacts are being notified.",
        relatedId: alertRecord.id.toString(),
      });

      logger.success("PANIC", "Notification created for panic alert", {
        userId,
        alertId,
      });

      // ========== STEP 2: Return 200 OK immediately to user ==========
      res.status(200).json({
        success: true,
        message: "Panic alert received. Help is being sent.",
        data: {
          alertId: alertRecord.id,
          status: "pending",
          timestamp: new Date().toISOString(),
        },
      });

      // ========== STEP 3: Process blockchain + SMS in background (non-blocking) ==========
      if (alertId !== null) {
        this.processPanicAlertBackground(userId, locationData, alertId).catch(
          (err: Error) => {
            logger.error("PANIC", "Background processing failed", {
              userId,
              alertId,
              error: err.message,
            });
          }
        );
      }
    } catch (error) {
      logger.error("PANIC", "Panic alert creation failed", {
        alertId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to create panic alert",
        code: "PANIC_CREATION_FAILED",
      });
    }
  }

  /**
   * Process panic alert in background
   * PRIORITY ORDER:
   * 1. Send SMS to emergency contacts (CRITICAL - fastest)
   * 2. Send to blockchain (audit trail - can fail without affecting SMS)
   * Both run in parallel, not sequential
   */
  private async processPanicAlertBackground(
    userId: string,
    locationData: string,
    alertId: number
  ): Promise<void> {
    try {
      logger.info("PANIC", "Background processing started", { userId, alertId });

      // ========== PRIORITY 1: Send SMS immediately (independent of blockchain) ==========
      // Start SMS immediately - don't wait for blockchain
      const smsPromise = this.sendEmergencyContactAlerts(userId, locationData)
        .then(() => {
          logger.success("PANIC", "Emergency SMS alerts sent", {
            userId,
            alertId,
          });
        })
        .catch((err: Error) => {
          logger.error("PANIC", "SMS sending failed", {
            userId,
            alertId,
            error: err.message,
          });
        });

      // ========== PRIORITY 2: Send to blockchain (parallel, non-blocking) ==========
      // Blockchain runs in parallel, doesn't block SMS
      const blockchainPromise = blockchainService
        .sendPanicAlert(locationData)
        .then((tx: any) => {
          logger.success("PANIC", "Panic alert sent to blockchain", {
            userId,
            alertId,
            txHash: tx.txHash,
            blockNumber: tx.blockNumber,
          });

          // Update DB with blockchain info
          return (databaseService as any).updatePanicAlert(alertId, {
            txHash: tx.txHash,
            blockNumber: tx.blockNumber,
            status: "submitted",
          });
        })
        .then(() => {
          logger.success("PANIC", "Panic alert updated with blockchain tx", {
            userId,
            alertId,
          });
        })
        .catch((err: Error) => {
          logger.error("PANIC", "Blockchain processing failed", {
            userId,
            alertId,
            error: err.message,
          });
          // Note: SMS was already sent even if blockchain fails
        });

      // Wait for both to complete, but don't fail if either fails
      await Promise.allSettled([smsPromise, blockchainPromise]);

      logger.success("PANIC", "Background processing completed", {
        userId,
        alertId,
      });
    } catch (error) {
      logger.error("PANIC", "Background processing error", {
        userId,
        alertId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get panic alert history
   * GET /api/panic-alert/history
   * Protected: User can only see their own alerts
   */
  async getPanicHistory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { limit = 10, offset = 0 } = req.query;

      logger.logRequest("GET", "/api/panic-alert/history", {
        userId,
        limit,
        offset,
      });

      if (!userId) {
        logger.warn("PANIC", "User not authenticated", {});
        res.status(401).json({
          error: true,
          message: "Authentication required",
        });
        return;
      }

      const parsedLimit = typeof limit === "string" ? parseInt(limit) : 10;
      const parsedOffset = typeof offset === "string" ? parseInt(offset) : 0;

      const alerts = await (databaseService as any).getPanicAlerts(
        userId,
        parsedLimit,
        parsedOffset
      );

      logger.success("PANIC", "Retrieved panic alert history", {
        userId,
        count: alerts.length,
      });

      res.status(200).json({
        success: true,
        message: "Panic alert history retrieved",
        data: {
          alerts: alerts.map((alert: any) => {
            const txHash = alert.txhash || alert.txHash;
            const blockNumber = alert.blocknumber || alert.blockNumber;

            let status = "pending";
            if (txHash && blockNumber) {
              status = "confirmed";
            } else if (txHash && !blockNumber) {
              status = "failed";
            }

            return {
              id: alert.id,
              locationData: alert.locationdata || alert.locationData,
              panicMessage: alert.custompanicmessage || null,
              txHash: txHash,
              blockNumber: blockNumber,
              status: status,
              createdAt: alert.createdat || alert.createdAt,
              emergencyContacts: (alert.emergencyContacts || []).map(
                (contact: any) => ({
                  name: contact.name,
                  phone: contact.phone,
                  relationship: contact.relationship,
                })
              ),
            };
          }),
        },
      });
    } catch (error) {
      logger.error("PANIC", "Get panic history failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: true,
        message: "Failed to retrieve panic alert history",
        code: "GET_PANIC_FAILED",
      });
    }
  }

  /**
   * Send SMS to emergency contacts (background task)
   * Called asynchronously after panic alert is saved
   */
  private async sendEmergencyContactAlerts(
    userId: string,
    locationData: string
  ): Promise<void> {
    try {
      // Get user's custom panic message
      const userResult = await (databaseService as any).query(
        "SELECT email, custompanicmessage FROM users WHERE userid = $1",
        [userId]
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        logger.warn("PANIC", "User not found for emergency alerts", { userId });
        return;
      }

      const user = userResult.rows[0];

      // Get active emergency contacts
      const contactsResult = await (databaseService as any).query(
        "SELECT phone, name FROM emergency_contacts WHERE userid = $1 AND isactive = true",
        [userId]
      );

      if (!contactsResult.rows || contactsResult.rows.length === 0) {
        logger.info("PANIC", "No emergency contacts to notify", { userId });
        return;
      }

      // Build message with custom panic message or default
      const panicMessage =
        user.custompanicmessage ||
        "Emergency alert from SafeGirl! I need help urgently!";

      // Parse location data to extract coordinates
      let mapLink = "";
      try {
        const location = JSON.parse(locationData);
        if (location.latitude && location.longitude) {
          mapLink = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
        } else {
          mapLink = `https://maps.google.com/?q=${encodeURIComponent(
            locationData
          )}`;
        }
      } catch (e) {
        // If not JSON, treat as raw coordinates or address
        mapLink = `https://maps.google.com/?q=${encodeURIComponent(
          locationData
        )}`;
      }

      const fullMessage = `${panicMessage}\n\nLocation: ${mapLink}`;

      // Send SMS to each emergency contact
      const smsResults: any[] = [];
      for (let contact of contactsResult.rows) {
        try {
          // Normalize phone before sending (defensive - remove spaces, format correctly)
          const normalizedPhone = this.normalizePhoneNumber(contact.phone);

          if (!normalizedPhone) {
            logger.warn("PANIC", "Invalid phone number, skipping", {
              userId,
              phone: contact.phone,
            });
            smsResults.push({
              phone: contact.phone,
              sent: false,
              error: "Invalid phone number",
            });
            continue;
          }

          // Send SMS via email service (Twilio integration)
          await emailService.sendSMS(normalizedPhone, fullMessage);
          smsResults.push({ phone: normalizedPhone, sent: true });

          logger.info("PANIC", "Emergency SMS sent", {
            userId,
            phone: normalizedPhone,
            name: contact.name,
          });

          // Rate limit: 1 second between SMS to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          smsResults.push({
            phone: contact.phone,
            sent: false,
            error: errorMsg,
          });
          logger.error("PANIC", "Emergency SMS failed", {
            userId,
            phone: contact.phone,
            error: errorMsg,
          });
        }
      }

      logger.success("PANIC", "Emergency contact alerts completed", {
        userId,
        contactsCount: contactsResult.rows.length,
        sentCount: smsResults.filter((r) => r.sent).length,
        failedCount: smsResults.filter((r) => !r.sent).length,
      });
    } catch (error) {
      logger.error("PANIC", "Send emergency alerts error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Set custom panic message
   * POST /api/emergency/set-panic-message
   */
  async setPanicMessage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { message } = req.body;
      const userId = req.user?.userId;

      logger.logRequest("POST", "/api/emergency/set-panic-message", { userId });

      // Update user's custom panic message
      const result = await (databaseService as any).query(
        "UPDATE users SET custompanicmessage = $1 WHERE userid = $2 RETURNING custompanicmessage",
        [message, userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error("Failed to set panic message");
      }

      logger.success("PANIC", "Custom panic message set", { userId });

      res.status(200).json({
        success: true,
        message: "Panic message set successfully",
        data: { panicMessage: result.rows[0].custompanicmessage },
      });
    } catch (error) {
      logger.error("PANIC", "Set panic message error", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }

  /**
   * Get custom panic message
   * GET /api/emergency/panic-message
   */
  async getPanicMessage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      logger.logRequest("GET", "/api/emergency/panic-message", { userId });

      const result = await (databaseService as any).query(
        "SELECT custompanicmessage FROM users WHERE userid = $1",
        [userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error("User not found");
      }

      const panicMessage = result.rows[0].custompanicmessage || null;

      res.status(200).json({
        success: true,
        data: {
          panicMessage,
          isDefault: !panicMessage,
          defaultMessage: "Emergency alert from SafeGirl! I need help urgently!",
        },
      });
    } catch (error) {
      logger.error("PANIC", "Get panic message error", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }

  /**
   * Add emergency contact
   * POST /api/emergency/add-contact
   */
  async addEmergencyContact(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { phone, name, relationship } = req.body;
      const userId = req.user?.userId;

      logger.logRequest("POST", "/api/emergency/add-contact", { userId, phone });

      // Normalize phone number (remove spaces, dashes, etc.)
      const normalizedPhone = this.normalizePhoneNumber(phone);

      if (!normalizedPhone) {
        logger.warn("PANIC", "Invalid phone number", { userId, phone });
        res.status(400).json({
          error: true,
          message: "Invalid phone number",
        });
        return;
      }

      // Check if contact already exists (by normalized phone)
      const existingResult = await (databaseService as any).query(
        "SELECT id FROM emergency_contacts WHERE userid = $1 AND phone = $2",
        [userId, normalizedPhone]
      );

      if (existingResult.rows && existingResult.rows.length > 0) {
        logger.warn("PANIC", "Emergency contact already exists", {
          userId,
          phone: normalizedPhone,
        });
        res.status(409).json({
          error: true,
          message: "This contact is already in your emergency list",
        });
        return;
      }

      // Add emergency contact with normalized phone
      const result = await (databaseService as any).query(
        `INSERT INTO emergency_contacts (userid, phone, name, relationship, isactive, createdat, updatedat)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         RETURNING id, phone, name, relationship, isactive, createdat`,
        [userId, normalizedPhone, name || null, relationship || null]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error("Failed to add emergency contact");
      }

      const contact = result.rows[0];

      logger.success("PANIC", "Emergency contact added", {
        userId,
        contactId: contact.id,
        phone: contact.phone,
      });

      res.status(201).json({
        success: true,
        message: "Emergency contact added successfully",
        data: {
          contactId: contact.id,
          phone: contact.phone,
          name: contact.name,
          relationship: contact.relationship,
          isActive: contact.isactive,
        },
      });
    } catch (error) {
      logger.error("PANIC", "Add emergency contact error", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }

  /**
   * Remove emergency contact
   * DELETE /api/emergency/remove-contact/:contactId
   */
  async removeEmergencyContact(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { contactId } = req.params;
      const userId = req.user?.userId;

      logger.logRequest("DELETE", "/api/emergency/remove-contact/:contactId", {
        userId,
        contactId,
      });

      // Verify contact belongs to user before deleting
      const checkResult = await (databaseService as any).query(
        "SELECT id FROM emergency_contacts WHERE id = $1 AND userid = $2",
        [contactId, userId]
      );

      if (!checkResult.rows || checkResult.rows.length === 0) {
        logger.warn("PANIC", "Emergency contact not found", { userId, contactId });
        res.status(404).json({
          error: true,
          message: "Emergency contact not found",
        });
        return;
      }

      // Delete emergency contact
      await (databaseService as any).query(
        "DELETE FROM emergency_contacts WHERE id = $1",
        [contactId]
      );

      logger.success("PANIC", "Emergency contact removed", { userId, contactId });

      res.status(200).json({
        success: true,
        message: "Emergency contact removed successfully",
      });
    } catch (error) {
      logger.error("PANIC", "Remove emergency contact error", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }

  /**
   * Edit emergency contact details
   * PUT /api/emergency/edit-contact/:contactId
   */
  async editEmergencyContact(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { contactId } = req.params;
      const { phone, name, relationship } = req.body;
      const userId = req.user?.userId;

      logger.logRequest("PUT", "/api/emergency/edit-contact/:contactId", {
        userId,
        contactId,
      });

      // Verify contact belongs to user before editing
      const checkResult = await (databaseService as any).query(
        "SELECT id, phone FROM emergency_contacts WHERE id = $1 AND userid = $2",
        [contactId, userId]
      );

      if (!checkResult.rows || checkResult.rows.length === 0) {
        logger.warn("PANIC", "Emergency contact not found", { userId, contactId });
        res.status(404).json({
          error: true,
          message: "Emergency contact not found",
        });
        return;
      }

      const oldPhone = checkResult.rows[0].phone;

      // Normalize phone if provided
      let normalizedPhone = oldPhone;
      if (phone) {
        normalizedPhone = this.normalizePhoneNumber(phone);

        if (!normalizedPhone) {
          logger.warn("PANIC", "Invalid phone number", { userId, phone });
          res.status(400).json({
            error: true,
            message: "Invalid phone number",
          });
          return;
        }

        // Check if new phone already exists for this user (but different contact)
        if (normalizedPhone !== oldPhone) {
          const existingResult = await (databaseService as any).query(
            "SELECT id FROM emergency_contacts WHERE userid = $1 AND phone = $2 AND id != $3",
            [userId, normalizedPhone, contactId]
          );

          if (existingResult.rows && existingResult.rows.length > 0) {
            logger.warn("PANIC", "Phone already exists for another contact", {
              userId,
              phone: normalizedPhone,
            });
            res.status(409).json({
              error: true,
              message: "This phone number is already in your emergency list",
            });
            return;
          }
        }
      }

      // Update emergency contact
      const result = await (databaseService as any).query(
        `UPDATE emergency_contacts
         SET phone = $1, name = $2, relationship = $3, updatedat = NOW()
         WHERE id = $4 AND userid = $5
         RETURNING id, phone, name, relationship, isactive, createdat, updatedat`,
        [normalizedPhone, name || null, relationship || null, contactId, userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error("Failed to update emergency contact");
      }

      const contact = result.rows[0];

      logger.success("PANIC", "Emergency contact updated", {
        userId,
        contactId,
        phone: contact.phone,
      });

      res.status(200).json({
        success: true,
        message: "Emergency contact updated successfully",
        data: {
          contactId: contact.id,
          phone: contact.phone,
          name: contact.name,
          relationship: contact.relationship,
          isActive: contact.isactive,
          createdAt: contact.createdat,
          updatedAt: contact.updatedat,
        },
      });
    } catch (error) {
      logger.error("PANIC", "Edit emergency contact error", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }

  /**
   * Get all emergency contacts for user
   * GET /api/emergency/contacts
   */
  async getEmergencyContacts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      logger.logRequest("GET", "/api/emergency/contacts", { userId });

      const result = await (databaseService as any).query(
        `SELECT id, phone, name, relationship, isactive, createdat
         FROM emergency_contacts
         WHERE userid = $1
         ORDER BY createdat DESC`,
        [userId]
      );

      const contacts = result.rows
        ? result.rows.map((row: any) => ({
            contactId: row.id,
            phone: row.phone,
            name: row.name,
            relationship: row.relationship,
            isActive: row.isactive,
            createdAt: row.createdat,
          }))
        : [];

      logger.success("PANIC", "Retrieved emergency contacts", {
        userId,
        count: contacts.length,
      });

      res.status(200).json({
        success: true,
        data: {
          contacts,
          totalCount: contacts.length,
        },
      });
    } catch (error) {
      logger.error("PANIC", "Get emergency contacts error", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }
}

export default new PanicController();
