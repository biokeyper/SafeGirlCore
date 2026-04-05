/**
 * SMS Batch Processor
 * Collects SMS messages and batches them for 30 seconds to reduce costs
 * - Deduplicates messages to same phone within batch window
 * - Reduces SMS costs by preventing duplicate SMS to same contact
 * - Maintains emergency responsiveness (30s batch window is acceptable)
 */

import logger from '../utils/logger';
import databaseService from './database';
import emailService from './email';

interface PendingSms {
  queueId: string;
  alertId: string;
  userId: string;
  recipientPhone: string;
  message: string;
  addedAt: number;
}

const BATCH_WINDOW_MS = parseInt(process.env.SMS_BATCH_WINDOW_MS || '30000'); // 30 seconds
const BATCH_SIZE_LIMIT = 100; // Max SMS per batch
const DEDUP_WINDOW_MS = BATCH_WINDOW_MS; // Dedup window = batch window

let pendingBatch: Map<string, PendingSms> = new Map(); // key = recipientPhone
let batchTimer: NodeJS.Timeout | null = null;
let batchStartTime = 0;

/**
 * Add SMS to batch queue
 * If this is the first SMS in the batch, start the batch timer
 * @param smsRecord - SMS queue record {queueId, alertId, userId, recipientPhone, message}
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
    // Keep existing (first one in batch), discard this one
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
 * When timer fires, process all pending SMS
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

  // Count successes and failures
  const successes = sendResults.filter((r) => r.status === 'fulfilled').length;
  const failures = sendResults.filter((r) => r.status === 'rejected').length;

  logger.success('SMS_BATCH', 'Batch processing completed', {
    batchSize: batchToProcess.length,
    sent: successes,
    failed: failures,
    batchElapsedMs,
    savedSms: batchToProcess.length > 0 ? Math.max(0, batchToProcess.length - successes) : 0,
  });

  // Log any send failures
  sendResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error('SMS_BATCH', 'SMS send failed in batch', {
        smsIndex: index,
        phone: batchToProcess[index]?.recipientPhone,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
}

/**
 * Send a single SMS from batch
 */
async function sendSingleSmsFromBatch(sms: PendingSms): Promise<void> {
  const { queueId, alertId, userId, recipientPhone, message } = sms;

  try {
    // Send SMS via Twilio
    await emailService.sendSMS(recipientPhone, message);

    // Delete from queue after successful send
    await databaseService.deleteSmsQueueEntry(queueId);

    logger.info('SMS_BATCH', 'SMS sent from batch', {
      queueId,
      alertId,
      phone: recipientPhone,
    });
  } catch (error) {
    // Queue for retry instead of failing
    const errorMsg = error instanceof Error ? error.message : String(error);
    const nextRetryAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

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

/**
 * Flush batch immediately (for testing or shutdown)
 */
async function flushBatchImmediate(): Promise<void> {
  logger.info('SMS_BATCH', 'Immediate batch flush requested', {
    pendingInBatch: pendingBatch.size,
  });
  await flushBatch();
}

export default {
  addToSmsBatch,
  flushBatchImmediate,
  getBatchStats,
};
