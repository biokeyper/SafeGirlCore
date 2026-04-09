/**
 * BullMQ SMS Batch Processor
 * Collects SMS messages and batches them for 30 seconds to reduce costs
 * - Deduplicates messages to same phone within batch window
 * - Uses Redis-backed BullMQ for reliability
 * - Maintains emergency responsiveness (30s batch window is acceptable)
 */

import bullMqService from './bullMqService';
import databaseService from './database';
import emailService from './email';
import logger from '../utils/logger';

interface PendingSms {
  queueId: string;
  alertId: string;
  userId: string;
  recipientPhone: string;
  message: string;
  addedAt: number;
}

const BATCH_WINDOW_MS = parseInt(process.env.SMS_BATCH_WINDOW_MS || '30000');
const BATCH_SIZE_LIMIT = 100;

let pendingBatch: Map<string, PendingSms> = new Map();
let batchTimer: NodeJS.Timeout | null = null;
let batchStartTime = 0;
let recurringJobId: string | null = null;

/**
 * Add SMS to batch queue
 */
export function addToSmsBatch(smsRecord: any): void {
  const { id: queueId, alert_id, user_id, recipient_phone, message } = smsRecord;
  const dedupeKey = recipient_phone;
  const now = Date.now();

  // If this is first SMS in batch, start timer
  if (pendingBatch.size === 0) {
    batchStartTime = now;
    startBatchTimer();
    logger.info('SMS_BATCH', 'Batch window started', { windowMs: BATCH_WINDOW_MS });
  }

  // Check for duplicate phone in current batch
  if (pendingBatch.has(dedupeKey)) {
    const existing = pendingBatch.get(dedupeKey)!;
    logger.info('SMS_BATCH', 'Duplicate phone detected in batch - keeping first SMS', {
      phone: dedupeKey,
      existingAlertId: existing.alertId,
      newAlertId: alert_id,
    });
    // Delete this queue entry as we'll use the existing message
    databaseService.deleteSmsQueueEntry(queueId).catch((err) => {
      logger.error('SMS_BATCH', 'Failed to delete duplicate queue entry', {
        queueId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return;
  }

  // Add to batch
  pendingBatch.set(dedupeKey, {
    queueId,
    alertId: alert_id,
    userId: user_id,
    recipientPhone: dedupeKey,
    message,
    addedAt: now,
  });

  logger.debug('SMS_BATCH', 'SMS added to batch', {
    phone: dedupeKey,
    batchSize: pendingBatch.size,
  });

  // If batch is full, send immediately
  if (pendingBatch.size >= BATCH_SIZE_LIMIT) {
    logger.info('SMS_BATCH', 'Batch size limit reached, flushing early', {
      batchSize: pendingBatch.size,
    });
    flushBatch();
  }
}

/**
 * Start the batch timer
 */
function startBatchTimer(): void {
  if (batchTimer) {
    clearTimeout(batchTimer);
  }

  batchTimer = setTimeout(() => {
    batchTimer = null;
    flushBatch();
  }, BATCH_WINDOW_MS);
}

/**
 * Send all pending SMS and clear batch
 */
async function flushBatch(): Promise<void> {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (pendingBatch.size === 0) {
    return;
  }

  const batchToProcess = Array.from(pendingBatch.values());
  const batchElapsedMs = Date.now() - batchStartTime;

  logger.info('SMS_BATCH', 'Flushing SMS batch', {
    batchSize: batchToProcess.length,
    batchElapsedMs,
  });

  pendingBatch.clear();

  // Send all SMS in parallel
  const sendResults = await Promise.allSettled(
    batchToProcess.map((sms) => sendSingleSmsFromBatch(sms))
  );

  const successes = sendResults.filter((r) => r.status === 'fulfilled').length;
  const failures = sendResults.filter((r) => r.status === 'rejected').length;

  logger.success('SMS_BATCH', 'Batch processing completed', {
    batchSize: batchToProcess.length,
    sent: successes,
    failed: failures,
    batchElapsedMs,
  });
}

/**
 * Send a single SMS from batch
 */
async function sendSingleSmsFromBatch(sms: PendingSms): Promise<void> {
  const { queueId, alertId, userId, recipientPhone, message } = sms;

  try {
    await emailService.sendSMS(recipientPhone, message);
    await databaseService.deleteSmsQueueEntry(queueId);

    logger.info('SMS_BATCH', 'SMS sent from batch', {
      queueId,
      alertId,
      phone: recipientPhone,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const nextRetryAt = new Date(Date.now() + 2 * 60 * 1000);

    await databaseService.updateSmsQueueStatus(queueId, {
      success: false,
      lastError: errorMsg,
      retryCount: 1,
      nextRetryAt: nextRetryAt.toISOString(),
    });

    logger.warn('SMS_BATCH', 'SMS send failed, queued for retry', {
      queueId,
      alertId,
      phone: recipientPhone,
      nextRetryAt: nextRetryAt.toISOString(),
      error: errorMsg,
    });
  }
}

/**
 * Initialize BullMQ processor for SMS batching
 */
async function initialize(): Promise<void> {
  try {
    logger.logServer('Initializing BullMQ SMS batch processor...');

    const queue = bullMqService.getQueue('smsBatch');
    if (!queue) {
      throw new Error('SMS batch queue not available');
    }

    queue.removeAllListeners();

    queue.process(async (job) => {
      logger.debug('SMS_BATCH', `Processing SMS batch job ${job.id}`);
      await flushBatch();
      return { processed: pendingBatch.size };
    });

    queue.on('completed', (job) => {
      logger.debug('SMS_BATCH', `SMS batch job completed`, { jobId: job.id });
    });

    queue.on('failed', (job, err) => {
      logger.error('SMS_BATCH', `SMS batch job failed`, {
        jobId: job.id,
        error: err.message,
      });
    });

    logger.success('SMS_BATCH', 'BullMQ SMS batch processor initialized');
  } catch (error) {
    logger.error('SMS_BATCH', 'Failed to initialize BullMQ SMS batch processor', {
      error: (error as Error).message
    });
    throw error;
  }
}

/**
 * Start recurring batch flush job
 */
async function start(): Promise<void> {
  try {
    logger.info('SMS_BATCH', `Starting SMS batch processor (every ${BATCH_WINDOW_MS / 1000}s)`);

    const queue = bullMqService.getQueue('smsBatch');
    if (!queue) {
      throw new Error('SMS batch queue not available');
    }

    // Schedule recurring batch flush
    const job = await queue.add(
      { type: 'flushBatch' },
      {
        repeat: {
          every: BATCH_WINDOW_MS,
        },
        jobId: 'sms-batch-flush-recurring',
      }
    );

    recurringJobId = String(job.id);
    logger.success('SMS_BATCH', `Recurring batch flush job scheduled (ID: ${job.id})`);
  } catch (error) {
    logger.error('SMS_BATCH', 'Failed to start SMS batch processor', {
      error: (error as Error).message
    });
    throw error;
  }
}

/**
 * Stop the SMS batch processor
 */
async function stop(): Promise<void> {
  try {
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }

    const queue = bullMqService.getQueue('smsBatch');
    if (!queue || !recurringJobId) return;

    const job = await queue.getJob(recurringJobId);
    if (job) {
      await job.remove();
      logger.info('SMS_BATCH', 'SMS batch processor stopped');
    }
  } catch (error) {
    logger.error('SMS_BATCH', 'Error stopping SMS batch processor', {
      error: (error as Error).message
    });
  }
}

/**
 * Flush batch immediately (for testing or shutdown)
 */
async function flushBatchImmediate(): Promise<void> {
  logger.info('SMS_BATCH', 'Immediate batch flush requested', {
    pendingInBatch: pendingBatch.size,
  });
  await flushBatch();
}

/**
 * Get current batch stats
 */
function getBatchStats(): any {
  return {
    pendingInBatch: pendingBatch.size,
    batchWindowMs: BATCH_WINDOW_MS,
    isBatchActive: batchTimer !== null,
    batchElapsedMs: batchStartTime > 0 ? Date.now() - batchStartTime : 0,
  };
}

export default {
  addToSmsBatch,
  initialize,
  start,
  stop,
  flushBatchImmediate,
  getBatchStats,
};
