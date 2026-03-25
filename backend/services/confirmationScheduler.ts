/**
 * Confirmation Scheduler
 * Background job that updates confirmation counts for pending reports
 * Marks reports as confirmed once confirmations >= threshold
 */

import contractManager from '../config/contracts';
import databaseService from './database';
import logger from '../utils/logger';

const CONFIRMATION_THRESHOLD = parseInt(process.env.CONFIRMATION_THRESHOLD || '12');
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '30000'); // 30 seconds

let intervalHandle: NodeJS.Timeout | null = null;

async function checkPendingReports(): Promise<void> {
  try {
    // Fetch all pending reports (limit to 50 per run to avoid overwhelming the system)
    const result = await (databaseService as any).getSubmissions({ status: 'pending', limit: 50, offset: 0 });
    const pending = (result?.submissions || result || []) as any[];

    if (pending.length === 0) return;

    logger.info('SCHEDULER', `Checking ${pending.length} pending reports`);

    // Get current block number once for all reports
    const provider = contractManager.getProvider();
    const currentBlock = await provider.getBlockNumber();

    for (const report of pending) {
      try {
        const blockNumber = parseInt(report.blocknumber as unknown as string);
        if (!blockNumber) {
          logger.warn('SCHEDULER', `Report missing blockNumber: ${report.reportid}`);
          continue;
        }

        // Calculate confirmations: current block - submission block number
        const confirmations = Math.max(0, currentBlock - blockNumber);

        // Update confirmations count in database
        await databaseService.updateConfirmations(report.reportid, confirmations);

        // If threshold reached, mark as submitted
        if (confirmations >= CONFIRMATION_THRESHOLD) {
          await databaseService.updateStatus(report.reportid, 'submitted', {
            blockNumber: report.blocknumber
          });
          logger.success('SCHEDULER', `Report submitted: ${report.reportid} (${confirmations} confirmations)`);
        } else {
          logger.info('SCHEDULER', `Report pending: ${report.reportid} (${confirmations}/${CONFIRMATION_THRESHOLD})`);
        }
      } catch (err) {
        logger.error('SCHEDULER', `Failed to check report ${report.reportid}`, {
          error: (err as Error).message
        });
        // Continue processing other reports on error
      }
    }
  } catch (err) {
    logger.error('SCHEDULER', 'Scheduler run failed', {
      error: (err as Error).message
    });
  }
}

/**
 * Start the confirmation scheduler
 */
function start(): void {
  logger.info('SCHEDULER', `Starting confirmation scheduler (every ${POLL_INTERVAL_MS / 1000}s, threshold: ${CONFIRMATION_THRESHOLD} confirmations)`);

  // Run immediately on start
  checkPendingReports().catch(err => {
    logger.error('SCHEDULER', 'Initial scheduler run failed', {
      error: (err as Error).message
    });
  });

  // Set up recurring interval
  intervalHandle = setInterval(checkPendingReports, POLL_INTERVAL_MS);
}

/**
 * Stop the confirmation scheduler
 */
function stop(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('SCHEDULER', 'Confirmation scheduler stopped');
  }
}

export { start, stop };
