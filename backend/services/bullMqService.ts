/**
 * BullMQ Job Queue Service
 * Manages all Redis-backed job queues for reliable background processing
 */

import Queue from 'bull';
import logger from '../utils/logger';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

// Define all job queues
const queues = {
  // Confirmation scheduler - checks pending reports, updates confirmations
  confirmations: new Queue('confirmations', {
    redis: { host: REDIS_HOST, port: REDIS_PORT },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
    },
  }),

  // SMS batch processor - batches and deduplicates SMS sends
  smsBatch: new Queue('smsBatch', {
    redis: { host: REDIS_HOST, port: REDIS_PORT },
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: true,
    },
  }),

  // SMS retry queue - retries failed SMS sends
  smsRetry: new Queue('smsRetry', {
    redis: { host: REDIS_HOST, port: REDIS_PORT },
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
    },
  }),

  // Panic alert background processing - blockchain + SMS notifications
  panicAlert: new Queue('panicAlert', {
    redis: { host: REDIS_HOST, port: REDIS_PORT },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
    },
  }),
};

// Event listeners for all queues
Object.entries(queues).forEach(([name, queue]) => {
  queue.on('error', (error) => {
    logger.error('BULLMQ', `Queue '${name}' error`, { error: error.message });
  });

  queue.on('failed', (job, err) => {
    logger.warn('BULLMQ', `Job failed in queue '${name}'`, {
      jobId: job.id,
      attempt: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      error: err.message,
    });
  });

  queue.on('completed', (job) => {
    logger.debug('BULLMQ', `Job completed in queue '${name}'`, { jobId: job.id });
  });
});

/**
 * Initialize all queues
 */
async function initialize(): Promise<boolean> {
  try {
    logger.logServer('Initializing BullMQ queues...');
    logger.info('BULLMQ', `Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}`);

    // Queues are created on demand, they will connect to Redis when first used
    logger.success('BULLMQ', 'All queues initialized successfully');
    return true;
  } catch (error) {
    logger.error('BULLMQ', 'Failed to initialize queues', {
      error: (error as Error).message,
    });
    return false;
  }
}

/**
 * Close all queues
 */
async function close(): Promise<void> {
  try {
    logger.logServer('Closing BullMQ queues...');

    // Close all queues
    await Promise.all(Object.values(queues).map((q) => q.close()));

    logger.success('BULLMQ', 'All queues closed');
  } catch (error) {
    logger.error('BULLMQ', 'Error closing queues', {
      error: (error as Error).message,
    });
  }
}

/**
 * Get queue by name
 */
function getQueue(name: keyof typeof queues): Queue.Queue | null {
  return queues[name] || null;
}

/**
 * Get queue stats
 */
async function getQueueStats(): Promise<any> {
  const stats: any = {};

  for (const [name, queue] of Object.entries(queues)) {
    const counts = await queue.getJobCounts();
    stats[name] = counts;
  }

  return stats;
}

export default {
  queues,
  initialize,
  close,
  getQueue,
  getQueueStats,
};
