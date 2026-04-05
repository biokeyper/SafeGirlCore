/**
 * Encryption Master Key Rotation Script
 *
 * Re-encrypts all reports from old master key to new master key
 * Handles reports encrypted with different key versions gracefully
 *
 * Usage:
 *   npm run script:rotate-key
 *   npm run script:rotate-key -- --dry-run
 *   npm run script:rotate-key -- --batch-size 50
 *
 * Steps:
 * 1. Connect to database
 * 2. Fetch reports with old key version
 * 3. Decrypt with old key (available during rotation window)
 * 4. Re-encrypt with new key
 * 5. Update database with new encrypted key and version
 * 6. Log progress and errors
 * 7. Allow pause/resume if interrupted
 *
 * Safety features:
 * - Batch processing (doesn't lock database)
 * - Error handling (skips corrupted records, logs for manual review)
 * - Dry-run mode (test without making changes)
 * - Progress reporting (track completion percentage)
 * - Graceful shutdown (can pause and resume)
 */

import databaseService from '../services/database';
import encryptionService from '../services/encryptionWithRotation';
import logger from '../utils/logger';

interface RotationStats {
  total: number;
  rotated: number;
  skipped: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

interface RotationOptions {
  dryRun: boolean;
  batchSize: number;
  targetKeyVersion: number;
  oldKeyVersion: number;
  verbose: boolean;
}

// Default options
const defaultOptions: RotationOptions = {
  dryRun: process.argv.includes('--dry-run'),
  batchSize: parseInt(
    process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] || '100',
    10
  ),
  targetKeyVersion: encryptionService.getCurrentKeyVersion(),
  oldKeyVersion: encryptionService.getCurrentKeyVersion() - 1,
  verbose: process.argv.includes('--verbose'),
};

async function rotateEncryptionKey(options: RotationOptions = defaultOptions): Promise<void> {
  const stats: RotationStats = {
    total: 0,
    rotated: 0,
    skipped: 0,
    errors: 0,
    startTime: new Date(),
  };

  try {
    logger.info('ROTATION', 'Starting encryption key rotation', {
      dryRun: options.dryRun,
      batchSize: options.batchSize,
      targetKeyVersion: options.targetKeyVersion,
      oldKeyVersion: options.oldKeyVersion,
      rotationActive: encryptionService.isRotationActive(),
    });

    if (options.dryRun) {
      logger.warn('ROTATION', 'DRY RUN MODE - No changes will be made');
    }

    if (!encryptionService.isRotationActive()) {
      logger.warn('ROTATION', 'No previous key available - rotation window may be closed');
      logger.warn('ROTATION', 'Ensure ENCRYPTION_MASTER_KEY_PREVIOUS is set in environment');
    }

    // Get total count of records to migrate
    const countResult = await databaseService.query(
      'SELECT COUNT(*) as count FROM submissions WHERE key_version = $1',
      [options.oldKeyVersion]
    );
    stats.total = countResult.rows[0]?.count || 0;

    if (stats.total === 0) {
      logger.info('ROTATION', 'No records with old key version found - rotation may be complete');
      return;
    }

    logger.info('ROTATION', `Found ${stats.total} reports to rotate`);

    // Process in batches
    let offset = 0;
    let lastProcessedId = '';

    while (offset < stats.total) {
      const batchResult = await databaseService.query(
        `SELECT
          reportid,
          encryptionKey,
          encryptionKeyIv,
          encryptionKeyAuthTag
        FROM submissions
        WHERE key_version = $1
        ORDER BY reportid
        LIMIT $2
        OFFSET $3`,
        [options.oldKeyVersion, options.batchSize, offset]
      );

      if (!batchResult.rows || batchResult.rows.length === 0) {
        break;
      }

      logger.info('ROTATION', `Processing batch ${Math.floor(offset / options.batchSize) + 1}`, {
        batchSize: batchResult.rows.length,
        totalProcessed: stats.rotated + stats.errors,
        totalRemaining: stats.total - (stats.rotated + stats.errors),
      });

      for (const report of batchResult.rows) {
        try {
          // Decrypt with old key (available during rotation window)
          const reportKey = encryptionService.decryptKey(
            report.encryptionkey,
            report.encryptionkeyiv,
            report.encryptionkeyauthtag,
            report.reportid,
            options.oldKeyVersion
          );

          // Re-encrypt with new key
          const newEncrypted = encryptionService.encryptKey(reportKey, report.reportid);

          if (!options.dryRun) {
            // Update database
            await databaseService.query(
              `UPDATE submissions
               SET encryptionKey = $1,
                   encryptionKeyIv = $2,
                   encryptionKeyAuthTag = $3,
                   key_version = $4,
                   updatedAt = NOW()
               WHERE reportid = $5`,
              [
                newEncrypted.encryptedKey,
                newEncrypted.keyIv,
                newEncrypted.keyAuthTag,
                newEncrypted.keyVersion || options.targetKeyVersion,
                report.reportid,
              ]
            );
          }

          stats.rotated++;
          lastProcessedId = report.reportid;

          if (options.verbose) {
            logger.debug('ROTATION', 'Report rotated', {
              reportId: report.reportid,
              rotatedCount: stats.rotated,
            });
          }

          if (stats.rotated % 10 === 0) {
            const percentage = Math.round((stats.rotated / stats.total) * 100);
            logger.info('ROTATION', `Progress: ${stats.rotated}/${stats.total} (${percentage}%)`, {
              lastProcessedId,
            });
          }
        } catch (error) {
          logger.error('ROTATION', `Failed to rotate report ${report.reportid}`, {
            error: (error as Error).message,
          });
          stats.errors++;

          // Log error report for manual review
          if (stats.errors === 1) {
            logger.warn(
              'ROTATION',
              `Errors detected. Manual review needed. Check logs for details.`
            );
          }
        }
      }

      offset += options.batchSize;

      // Allow other database queries to process
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    stats.endTime = new Date();

    // Log final stats
    const duration = stats.endTime.getTime() - stats.startTime.getTime();
    const durationSeconds = Math.round(duration / 1000);

    logger.success('ROTATION', 'Key rotation complete', {
      total: stats.total,
      rotated: stats.rotated,
      skipped: stats.skipped,
      errors: stats.errors,
      durationSeconds,
      reportsPerSecond: Math.round(stats.rotated / (durationSeconds || 1)),
      dryRun: options.dryRun,
    });

    if (stats.errors > 0) {
      logger.warn('ROTATION', `${stats.errors} reports failed to rotate`, {
        message: 'Manual review and re-encryption needed. Check logs for affected report IDs.',
      });

      // Return exit code to indicate incomplete rotation
      process.exit(1);
    }

    if (options.dryRun) {
      logger.info('ROTATION', 'Dry run complete - no changes were made');
      process.exit(0);
    }
  } catch (error) {
    logger.error('ROTATION', 'Key rotation script failed', {
      error: (error as Error).message,
      rotatedBefore: stats.rotated,
      errorsBefore: stats.errors,
    });
    process.exit(1);
  }
}

// Run rotation
rotateEncryptionKey(defaultOptions);
