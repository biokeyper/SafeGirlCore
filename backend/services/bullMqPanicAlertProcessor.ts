/**
 * BullMQ Panic Alert Processor
 * Handles background processing of panic alerts with blockchain and SMS
 * Uses Redis-backed BullMQ for reliability and automatic retry
 */

import bullMqService from './bullMqService';
import blockchainService from './blockchain';
import databaseService from './database';
import smsBatchProcessor from './smsBatchProcessor';
import logger from '../utils/logger';

interface PanicAlertJob {
  userId: string;
  locationData: string;
  alertId: number;
}

let recurringJobId: string | null = null;

/**
 * Send SMS to emergency contacts
 */
async function sendEmergencyContactAlerts(
  userId: string,
  locationData: string,
  alertId: number
): Promise<any> {
  try {
    // Get user's custom panic message
    const userResult = await (databaseService as any).query(
      'SELECT email, custompanicmessage FROM users WHERE userid = $1',
      [userId]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      logger.warn('PANIC_QUEUE', 'User not found for emergency alerts', { userId });
      return { sent: 0, failed: 0 };
    }

    const user = userResult.rows[0];

    // Get active emergency contacts
    const contactsResult = await (databaseService as any).query(
      'SELECT phone, name FROM emergency_contacts WHERE userid = $1 AND isactive = true',
      [userId]
    );

    if (!contactsResult.rows || contactsResult.rows.length === 0) {
      logger.info('PANIC_QUEUE', 'No emergency contacts to notify', { userId });
      return { sent: 0, failed: 0 };
    }

    // Build message with custom panic message or default
    const panicMessage =
      user.custompanicmessage ||
      'Emergency alert from SafeGirl! I need help urgently!';

    // Parse location data to extract coordinates
    let mapLink = '';
    try {
      const location = JSON.parse(locationData);
      if (location.latitude && location.longitude) {
        mapLink = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
      } else {
        mapLink = `https://maps.google.com/?q=${encodeURIComponent(locationData)}`;
      }
    } catch (e) {
      mapLink = `https://maps.google.com/?q=${encodeURIComponent(locationData)}`;
    }

    const fullMessage = `${panicMessage}\n\nLocation: ${mapLink}`;

    // Send SMS to each emergency contact
    let sent = 0;
    let failed = 0;

    for (let contact of contactsResult.rows) {
      try {
        const normalizedPhone = contact.phone; // Already normalized when stored

        if (!normalizedPhone) {
          logger.warn('PANIC_QUEUE', 'Invalid phone number, skipping', {
            userId,
            phone: contact.phone,
          });
          failed++;
          continue;
        }

        // Add to SMS batch queue
        const queuedSms = await (databaseService as any).saveSmsToQueue(
          alertId.toString(),
          userId,
          normalizedPhone,
          fullMessage
        );

        smsBatchProcessor.addToSmsBatch(queuedSms);
        sent++;

        logger.info('PANIC_QUEUE', 'SMS added to batch queue', {
          userId,
          phone: normalizedPhone,
          name: contact.name,
          alertId,
          queueId: queuedSms.id,
        });
      } catch (err) {
        failed++;
        logger.error('PANIC_QUEUE', 'Failed to add SMS to batch queue', {
          userId,
          phone: contact.phone,
          alertId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.success('PANIC_QUEUE', 'Emergency contact alerts queued', {
      userId,
      alertId,
      contactsCount: contactsResult.rows.length,
      sent,
      failed,
    });

    return { sent, failed, total: contactsResult.rows.length };
  } catch (error) {
    logger.error('PANIC_QUEUE', 'Send emergency alerts error', {
      userId,
      alertId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Process panic alert background job
 * Handles blockchain submission and SMS notifications
 */
async function processPanicAlert(job: any): Promise<any> {
  const { userId, locationData, alertId }: PanicAlertJob = job.data;

  try {
    logger.info('PANIC_QUEUE', `Processing panic alert job ${job.id}`, {
      userId,
      alertId,
    });

    // ========== PRIORITY 1: Send SMS immediately (independent of blockchain) ==========
    const smsPromise = sendEmergencyContactAlerts(userId, locationData, alertId)
      .then((result) => {
        logger.success('PANIC_QUEUE', 'Emergency SMS alerts sent', {
          userId,
          alertId,
          ...result,
        });
        return result;
      })
      .catch((err: Error) => {
        logger.error('PANIC_QUEUE', 'SMS sending failed', {
          userId,
          alertId,
          error: err.message,
        });
        throw err; // Re-throw to trigger retry
      });

    // ========== PRIORITY 2: Send to blockchain (parallel, non-blocking) ==========
    const blockchainPromise = blockchainService
      .sendPanicAlert(locationData)
      .then((tx: any) => {
        logger.success('PANIC_QUEUE', 'Panic alert sent to blockchain', {
          userId,
          alertId,
          txHash: tx.txHash,
          blockNumber: tx.blockNumber,
        });

        // Update DB with blockchain info
        return (databaseService as any).updatePanicAlert(alertId, {
          txHash: tx.txHash,
          blockNumber: tx.blockNumber,
          status: 'submitted',
        });
      })
      .then(() => {
        logger.success('PANIC_QUEUE', 'Panic alert updated with blockchain tx', {
          userId,
          alertId,
        });
        return { blockchainSuccess: true };
      })
      .catch((err: Error) => {
        logger.error('PANIC_QUEUE', 'Blockchain processing failed', {
          userId,
          alertId,
          error: err.message,
        });
        // Don't re-throw - SMS success is enough
        return { blockchainSuccess: false, error: err.message };
      });

    // Wait for both to complete
    const [smsResult, blockchainResult] = await Promise.all([smsPromise, blockchainPromise]);

    logger.success('PANIC_QUEUE', 'Panic alert job completed', {
      userId,
      alertId,
      jobId: job.id,
      smsResult,
      blockchainResult,
    });

    return {
      success: true,
      smsResult,
      blockchainResult,
    };
  } catch (error) {
    logger.error('PANIC_QUEUE', 'Panic alert job failed', {
      userId,
      alertId,
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // Let BullMQ handle retry
  }
}

/**
 * Queue a panic alert for processing
 * Called from panicController after alert is saved to DB
 */
async function queuePanicAlert(userId: string, locationData: string, alertId: number): Promise<void> {
  try {
    const queue = bullMqService.getQueue('panicAlert');
    if (!queue) {
      logger.warn('PANIC_QUEUE', 'Panic alert queue not available, will retry via fallback');
      return;
    }

    const job = await queue.add(
      { userId, locationData, alertId },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        jobId: `panic-${alertId}`,
      }
    );

    logger.info('PANIC_QUEUE', 'Panic alert queued for processing', {
      userId,
      alertId,
      jobId: job.id,
    });
  } catch (error) {
    logger.error('PANIC_QUEUE', 'Failed to queue panic alert', {
      userId,
      alertId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Will be retried by controller fallback
  }
}

/**
 * Initialize BullMQ processor for panic alerts
 */
async function initialize(): Promise<void> {
  try {
    logger.logServer('Initializing BullMQ panic alert processor...');

    const queue = bullMqService.getQueue('panicAlert');
    if (!queue) {
      throw new Error('Panic alert queue not available');
    }

    queue.removeAllListeners();

    queue.process(async (job) => {
      return await processPanicAlert(job);
    });

    queue.on('completed', (job) => {
      const result = job.returnvalue;
      logger.debug('PANIC_QUEUE', `Panic alert job completed`, {
        jobId: job.id,
        success: result?.success,
      });
    });

    queue.on('failed', (job, err) => {
      logger.error('PANIC_QUEUE', `Panic alert job failed`, {
        jobId: job.id,
        attempt: job.attemptsMade,
        error: err.message,
      });
    });

    logger.success('PANIC_QUEUE', 'BullMQ panic alert processor initialized');
  } catch (error) {
    logger.error('PANIC_QUEUE', 'Failed to initialize BullMQ panic alert processor', {
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Stop the panic alert processor
 */
async function stop(): Promise<void> {
  try {
    const queue = bullMqService.getQueue('panicAlert');
    if (!queue) return;

    logger.info('PANIC_QUEUE', 'Panic alert processor stopped');
  } catch (error) {
    logger.error('PANIC_QUEUE', 'Error stopping panic alert processor', {
      error: (error as Error).message,
    });
  }
}

export default {
  initialize,
  stop,
  queuePanicAlert,
};
