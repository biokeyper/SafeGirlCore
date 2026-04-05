/**
 * SMS Retry Processor
 * Handles automatic retry of failed SMS messages from panic alerts
 * Runs as background job every 5 minutes (configurable via SMS_RETRY_INTERVAL_MS)
 */

import logger from '../utils/logger';
import databaseService from './database';
import emailService from './email';

const SMS_RETRY_INTERVAL_MS = parseInt(process.env.SMS_RETRY_INTERVAL_MS || '300000'); // 5 minutes default
const MAX_BATCH_SIZE = 50; // Process up to 50 SMS per run

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Calculate exponential backoff delay
 * Formula: min(2^retryCount * 60 seconds, 24 hours)
 * - Retry 0: 2 minutes (2^1)
 * - Retry 1: 4 minutes (2^2)
 * - Retry 2: 8 minutes (2^3)
 * - Max: 24 hours
 * @param retryCount - Current number of retries
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(retryCount: number): number {
  const baseSecs = Math.pow(2, retryCount + 1) * 60; // 2^(n+1) * 60 seconds
  const maxDelaySecs = 24 * 60 * 60; // 24 hours
  const delaySecs = Math.min(baseSecs, maxDelaySecs);
  return delaySecs * 1000;
}

/**
 * Process a single SMS from the queue
 * Attempts to send and updates queue status based on result
 */
async function processSingleSms(smsRecord: any): Promise<void> {
  const { id: queueId, alert_id, user_id, recipient_phone, message, retry_count } = smsRecord;

  try {
    logger.info('SMS_RETRY', 'Processing SMS from queue', {
      queueId,
      alertId: alert_id,
      phone: recipient_phone,
      retryAttempt: retry_count + 1,
    });

    // Attempt to send SMS via Twilio
    await emailService.sendSMS(recipient_phone, message);

    // Success: Update queue and delete entry
    await (databaseService as any).updateSmsQueueStatus(queueId, {
      success: true,
    });

    // Delete from queue after successful send
    await (databaseService as any).deleteSmsQueueEntry(queueId);

    logger.success('SMS_RETRY', 'SMS sent successfully on retry', {
      queueId,
      alertId: alert_id,
      phone: recipient_phone,
      retryAttempt: retry_count + 1,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const nextRetryCount = retry_count + 1;
    const backoffDelayMs = calculateBackoffDelay(retry_count);
    const nextRetryAt = new Date(Date.now() + backoffDelayMs);

    logger.warn('SMS_RETRY', 'SMS send failed - scheduling retry', {
      queueId,
      alertId: alert_id,
      phone: recipient_phone,
      retryAttempt: retry_count + 1,
      nextRetryAt: nextRetryAt.toISOString(),
      error: errorMsg,
    });

    // Update queue with failure info and next retry time
    try {
      await (databaseService as any).updateSmsQueueStatus(queueId, {
        success: false,
        lastError: errorMsg,
        retryCount: nextRetryCount,
        nextRetryAt: nextRetryAt.toISOString(),
      });
    } catch (updateErr) {
      logger.error('SMS_RETRY', 'Failed to update SMS queue after failure', {
        queueId,
        error: updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    }
  }
}

/**
 * Main processor function
 * Fetches pending SMS from queue and processes them
 */
async function processPendingSmsQueue(): Promise<void> {
  try {
    // Get all pending SMS that are ready to retry
    const pendingSms = await (databaseService as any).getPendingSmsQueue(MAX_BATCH_SIZE);

    if (pendingSms.length === 0) {
      logger.debug('SMS_RETRY', 'No pending SMS in queue');
      return;
    }

    logger.info('SMS_RETRY', `Processing ${pendingSms.length} SMS from queue`);

    // Process each SMS
    const results = await Promise.allSettled(
      pendingSms.map((smsRecord: any) => processSingleSms(smsRecord))
    );

    // Count successes and failures
    const successes = results.filter((r) => r.status === 'fulfilled').length;
    const failures = results.filter((r) => r.status === 'rejected').length;

    logger.success('SMS_RETRY', 'SMS batch processing completed', {
      total: pendingSms.length,
      succeeded: successes,
      failed: failures,
    });

    // Log failures for monitoring
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error('SMS_RETRY', 'SMS processing failed', {
          smsIndex: index,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
  } catch (error) {
    logger.error('SMS_RETRY', 'SMS queue processing failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Start SMS retry processor
 * Runs immediately on startup, then every SMS_RETRY_INTERVAL_MS (default 5 minutes)
 */
function start(): void {
  logger.info(
    'SMS_RETRY',
    `Starting SMS retry processor (every ${SMS_RETRY_INTERVAL_MS / 1000}s, max ${MAX_BATCH_SIZE} per run)`
  );

  // Run immediately on startup
  processPendingSmsQueue().catch((err) => {
    logger.error('SMS_RETRY', 'Initial SMS queue processing failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // Schedule recurring processing
  intervalHandle = setInterval(() => {
    processPendingSmsQueue().catch((err) => {
      logger.error('SMS_RETRY', 'Scheduled SMS queue processing failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, SMS_RETRY_INTERVAL_MS);

  logger.success('SMS_RETRY', 'SMS retry processor started');
}

/**
 * Stop SMS retry processor
 * Clears the interval timer on shutdown
 */
function stop(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('SMS_RETRY', 'SMS retry processor stopped');
  }
}

/**
 * Get current SMS queue stats (for monitoring)
 */
async function getQueueStats(): Promise<any> {
  try {
    // Get count of pending SMS
    const pendingResult = await (databaseService as any).query(
      "SELECT COUNT(*) as count FROM sms_queue WHERE status = 'pending'"
    );
    const pendingCount = pendingResult.rows?.[0]?.count || 0;

    // Get count of failed exhausted SMS
    const failedResult = await (databaseService as any).query(
      "SELECT COUNT(*) as count FROM sms_queue WHERE status = 'failed_exhausted'"
    );
    const failedCount = failedResult.rows?.[0]?.count || 0;

    // Get count of successfully sent SMS
    const sentResult = await (databaseService as any).query(
      "SELECT COUNT(*) as count FROM sms_queue WHERE status = 'sent'"
    );
    const sentCount = sentResult.rows?.[0]?.count || 0;

    return {
      pending: pendingCount,
      failedExhausted: failedCount,
      sent: sentCount,
      total: pendingCount + failedCount + sentCount,
    };
  } catch (error) {
    logger.error('SMS_RETRY', 'Failed to get queue stats', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export default {
  start,
  stop,
  getQueueStats,
  processPendingSmsQueue, // For testing/manual runs
};
