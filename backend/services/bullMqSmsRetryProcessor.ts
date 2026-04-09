/**
 * BullMQ SMS Retry Processor
 * Handles automatic retry of failed SMS messages from panic alerts
 * Uses Redis-backed BullMQ with exponential backoff
 */

import bullMqService from './bullMqService';
import databaseService from './database';
import emailService from './email';
import logger from '../utils/logger';

const SMS_RETRY_INTERVAL_MS = parseInt(process.env.SMS_RETRY_INTERVAL_MS || '300000'); // 5 minutes
const MAX_BATCH_SIZE = 50;

let recurringJobId: string | null = null;

/**
 * Calculate exponential backoff delay
 * Formula: min(2^retryCount * 60 seconds, 24 hours)
 */
function calculateBackoffDelay(retryCount: number): number {
  const baseSecs = Math.pow(2, retryCount + 1) * 60;
  const maxDelaySecs = 24 * 60 * 60;
  const delaySecs = Math.min(baseSecs, maxDelaySecs);
  return delaySecs * 1000;
}

/**
 * Process a single SMS from the queue
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

    await emailService.sendSMS(recipient_phone, message);

    await (databaseService as any).updateSmsQueueStatus(queueId, {
      success: true,
    });

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
 */
async function processPendingSmsQueue(): Promise<any> {
  try {
    const pendingSms = await (databaseService as any).getPendingSmsQueue(MAX_BATCH_SIZE);

    if (pendingSms.length === 0) {
      logger.debug('SMS_RETRY', 'No pending SMS in queue');
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    logger.info('SMS_RETRY', `Processing ${pendingSms.length} SMS from queue`);

    const results = await Promise.allSettled(
      pendingSms.map((smsRecord: any) => processSingleSms(smsRecord))
    );

    const successes = results.filter((r) => r.status === 'fulfilled').length;
    const failures = results.filter((r) => r.status === 'rejected').length;

    logger.success('SMS_RETRY', 'SMS batch processing completed', {
      total: pendingSms.length,
      succeeded: successes,
      failed: failures,
    });

    return { processed: pendingSms.length, succeeded: successes, failed: failures };
  } catch (error) {
    logger.error('SMS_RETRY', 'SMS queue processing failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Initialize BullMQ processor for SMS retry
 */
async function initialize(): Promise<void> {
  try {
    logger.logServer('Initializing BullMQ SMS retry processor...');

    const queue = bullMqService.getQueue('smsRetry');
    if (!queue) {
      throw new Error('SMS retry queue not available');
    }

    queue.removeAllListeners();

    queue.process(async (job) => {
      logger.debug('SMS_RETRY', `Processing SMS retry job ${job.id}`);
      return await processPendingSmsQueue();
    });

    queue.on('completed', (job) => {
      const result = job.returnvalue;
      logger.debug('SMS_RETRY', `SMS retry job completed`, {
        jobId: job.id,
        processed: result?.processed,
        succeeded: result?.succeeded,
      });
    });

    queue.on('failed', (job, err) => {
      logger.error('SMS_RETRY', `SMS retry job failed`, {
        jobId: job.id,
        attempt: job.attemptsMade,
        error: err.message,
      });
    });

    logger.success('SMS_RETRY', 'BullMQ SMS retry processor initialized');
  } catch (error) {
    logger.error('SMS_RETRY', 'Failed to initialize BullMQ SMS retry processor', {
      error: (error as Error).message
    });
    throw error;
  }
}

/**
 * Start recurring SMS retry job
 */
async function start(): Promise<void> {
  try {
    logger.info('SMS_RETRY', `Starting SMS retry processor (every ${SMS_RETRY_INTERVAL_MS / 1000}s, max ${MAX_BATCH_SIZE} per run)`);

    const queue = bullMqService.getQueue('smsRetry');
    if (!queue) {
      throw new Error('SMS retry queue not available');
    }

    // Run immediately on startup
    await processPendingSmsQueue();

    // Schedule recurring processing
    const job = await queue.add(
      { type: 'processPending' },
      {
        repeat: {
          every: SMS_RETRY_INTERVAL_MS,
        },
        jobId: 'sms-retry-process-recurring',
      }
    );

    recurringJobId = String(job.id);
    logger.success('SMS_RETRY', `Recurring SMS retry job scheduled (ID: ${job.id})`);
  } catch (error) {
    logger.error('SMS_RETRY', 'Failed to start SMS retry processor', {
      error: (error as Error).message
    });
    throw error;
  }
}

/**
 * Stop the SMS retry processor
 */
async function stop(): Promise<void> {
  try {
    const queue = bullMqService.getQueue('smsRetry');
    if (!queue || !recurringJobId) return;

    const job = await queue.getJob(recurringJobId);
    if (job) {
      await job.remove();
      logger.info('SMS_RETRY', 'SMS retry processor stopped');
    }
  } catch (error) {
    logger.error('SMS_RETRY', 'Error stopping SMS retry processor', {
      error: (error as Error).message
    });
  }
}

/**
 * Get current SMS queue stats
 */
async function getQueueStats(): Promise<any> {
  try {
    const pendingResult = await (databaseService as any).query(
      "SELECT COUNT(*) as count FROM sms_queue WHERE status = 'pending'"
    );
    const pendingCount = pendingResult.rows?.[0]?.count || 0;

    const failedResult = await (databaseService as any).query(
      "SELECT COUNT(*) as count FROM sms_queue WHERE status = 'failed_exhausted'"
    );
    const failedCount = failedResult.rows?.[0]?.count || 0;

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
  initialize,
  start,
  stop,
  getQueueStats,
  processPendingSmsQueue,
};
