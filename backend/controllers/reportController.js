/**
 * Report Controller
 * handles IPFS upload + blockchain submission
 */

const ipfsService = require('../services/ipfs');
const blockchainService = require('../services/blockchain');
const databaseService = require('../services/database');
const encryptionService = require('../services/encryption');
const logger = require('../utils/logger');

class ReportController {
  
  async submitReport(req, res, next) {
    let reportId = null;
    let ipfsHash = null;
    let txHash = null;

    try {
      const { payload, responses, metadata } = req.body;

      // Generate unique report ID
      reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      logger.logRequest('POST', '/api/submitReport', {
        reportId,
        responseCount: responses ? responses.length : 0,
        hasPayload: !!payload,
        hasMetadata: !!metadata
      });

      // ========== STEP 1: Backend Encryption ==========
      // Frontend sends unencrypted JSON payload
      // Backend encrypts it before uploading to IPFS
      logger.info('REPORT', 'Encrypting payload with backend key', { reportId });

      const encryptionResult = await encryptionService.encryptPayload(
        { payload, responses, metadata },
        reportId
      );

      // Encrypt the report key with master key for secure storage
      const keyEncryption = encryptionService.encryptKey(encryptionResult.reportKey, reportId);

      logger.info('REPORT', 'Payload encrypted and key secured', {
        reportId,
        encryptedSize: encryptionResult.encryptedData.length
      });

      // Convert encrypted data to buffer for IPFS upload
      const payloadBuffer = Buffer.from(encryptionResult.encryptedData, 'hex');

      // ========== STEP 2: Upload to IPFS ==========
      logger.info('REPORT', 'Uploading to IPFS', {
        reportId,
        payloadSize: payloadBuffer.length
      });

      ipfsHash = await ipfsService.uploadToIPFS(
        payloadBuffer,
        `report_${reportId}.bin`
      );

      logger.success('REPORT', 'IPFS upload successful', {
        reportId,
        ipfsHash
      });

      // ========== STEP 3: Call Smart Contract ==========
      logger.info('REPORT', 'Submitting to blockchain', {
        reportId,
        ipfsHash,
        responseCount: responses ? responses.length : 0
      });

      const blockchainResult = await blockchainService.submitReport(ipfsHash, responses || []);

      txHash = blockchainResult.txHash;

      logger.success('REPORT', 'Blockchain submission successful', {
        reportId,
        txHash,
        blockNumber: blockchainResult.blockNumber
      });

      // ========== STEP 4: Save to Database ==========
      // Critical: Database must sync with blockchain
      // If DB is down, we fail the entire submission to avoid orphaned records
      logger.info('REPORT', 'Saving to database', { reportId, txHash });

      let dbRecord;
      try {
        // Get userId from authenticated request (JWT token)
        const userId = req.user.userId;

        dbRecord = await databaseService.saveSubmission({
          reportId,
          txHash,
          ipfsHash,
          responses,
          blockNumber: blockchainResult.blockNumber,
          gasUsed: blockchainResult.gasUsed,
          metadata,
          userId,
          // Encryption key information (backend-encrypted)
          encryptionKey: keyEncryption.encryptedKey,
          encryptionKeyIv: keyEncryption.keyIv,
          encryptionKeyAuthTag: keyEncryption.keyAuthTag,
          encryptionDataIv: encryptionResult.iv,
          encryptionDataAuthTag: encryptionResult.authTag
        });

        logger.success('REPORT', 'Saved to database', {
          reportId,
          dbId: dbRecord.id
        });

        // Create notification for user
        await databaseService.createNotification({
          userId,
          type: 'report_submitted',
          title: 'Report Submitted',
          message: 'Your report has been submitted successfully.',
          relatedId: reportId
        });

        logger.success('REPORT', 'Notification created', { reportId, userId });
      } catch (dbError) {
        // Database save is critical - fail the entire submission
        logger.error('REPORT', 'Database save failed - blocking submission', {
          reportId,
          txHash,
          error: dbError.message
        });

        // Warning: txHash is on blockchain but not in database yet
        // This is a critical error - database sync issue
        const dbSyncError = new Error(
          `Database synchronization failed. Report recorded on blockchain (${txHash}) but not in database. ` +
          `Please contact support with txHash.`
        );
        dbSyncError.code = 'DB_SYNC_FAILED';
        throw dbSyncError;
      }

      // ========== STEP 5: Return Success Response ==========
      const successResponse = {
        success: true,
        reportId,
        txHash,
        ipfsHash,
        status: 'pending', // Still confirming on blockchain
        message: 'Report submitted successfully',
        data: {
          reportId,
          txHash,
          ipfsHash,
          blockNumber: blockchainResult.blockNumber,
          gasUsed: blockchainResult.gasUsed,
          timestamp: new Date().toISOString(),
          dbId: dbRecord?.id
        }
      };

      logger.logResponse('/api/submitReport', 200, 'Report submitted');
      res.status(200).json(successResponse);

    } catch (error) {
      // Log detailed error context
      logger.error('REPORT', 'Submission failed', {
        reportId,
        ipfsHash,
        txHash,
        errorMessage: error.message,
        errorCode: error.code
      });

      // Return error response
      const errorResponse = {
        error: true,
        reportId,
        message: error.message,
        code: error.code || 'SUBMISSION_ERROR'
      };

      // Determine status code based on error type
      let statusCode = 500;
      if (error.message.includes('validation')) {
        statusCode = 400;
      } else if (error.message.includes('IPFS')) {
        statusCode = 503;
      } else if (error.message.includes('Timeout')) {
        statusCode = 504;
      }

      logger.logResponse('/api/submitReport', statusCode, error.message);
      res.status(statusCode).json(errorResponse);
    }
  }

  /**
   * Get status of a submitted report
   */
  async getReportStatus(req, res, next) {
    try {
      const { reportId } = req.query;

      logger.logRequest('GET', `/api/reportStatus?reportId=${reportId}`);

      // Get userId for decryption (user's wallet address)
      const userId = blockchainService.getWalletAddress();

      // Query database for submission (fast)
      // Pass userId to decrypt responses and metadata
      const submission = await databaseService.getSubmission(reportId, userId);

      if (!submission) {
        logger.warn('REPORT', 'Report not found', { reportId });
        return res.status(404).json({
          error: true,
          reportId,
          message: 'Report not found'
        });
      }

      // Build response (immediate, no waiting for blockchain)
      const statusResponse = {
        success: true,
        reportId,
        status: submission.status,
        message: `Report status: ${submission.status}`,
        data: {
          reportId: submission.reportId,
          status: submission.status,
          txHash: submission.txHash,
          ipfsHash: submission.ipfsHash,
          blockNumber: submission.blockNumber,
          confirmations: submission.confirmations || null,
          createdAt: submission.createdAt,
          confirmedAt: submission.confirmedAt,
          gasUsed: submission.gasUsed
        }
      };

      logger.logResponse('/api/reportStatus', 200);
      res.status(200).json(statusResponse);  // ← User gets response NOW

      // ========== SECURITY: Verify in background (don't block user) ==========
      // This runs after response is sent to user
      if (submission.txHash) {
        this.verifyAndFixInBackground(reportId, submission).catch(err => {
          logger.warn('REPORT', 'Background verification failed', {
            reportId,
            error: err.message
          });
        });
      }

    } catch (error) {
      logger.error('REPORT', 'Status check failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to get report status'
      });
    }
  }

  /**
   * Verify report against blockchain in background
   * Logs tampering alerts if detected
   * @private
   */
  async verifyAndFixInBackground(reportId, submission) {
    try {
      logger.debug('REPORT', 'Starting background verification', { reportId });

      // Query blockchain (slow, but user doesn't see it)
      const txStatus = await blockchainService.getTransactionStatus(submission.txHash);

      // Check for data tampering
      if (txStatus.status !== submission.status) {
        logger.error('SECURITY', 'TAMPERING DETECTED - DB does not match blockchain', {
          reportId,
          dbStatus: submission.status,
          blockchainStatus: txStatus.status
        });

        // Log the tampering alert
        await databaseService.logTamperingAlert(
          reportId,
          submission.status,
          txStatus.status
        );

        // Log audit entry for the discrepancy
        await databaseService.logAudit(
          reportId,
          'status',
          submission.status,
          txStatus.status,
          'tampering_detected',
          'background_verification'
        );

        // Fix the database using blockchain (source of truth)
        const oldStatus = submission.status;
        await databaseService.updateStatus(reportId, txStatus.status, {
          blockNumber: txStatus.blockNumber
        });

        // Log the correction
        await databaseService.logAudit(
          reportId,
          'status',
          oldStatus,
          txStatus.status,
          'tampering_detected',
          'background_job'
        );

        // Mark alert as corrected
        await databaseService.markAlertCorrected(reportId);

        logger.success('SECURITY', 'Tampering corrected', {
          reportId,
          correctedFrom: oldStatus,
          correctedTo: txStatus.status
        });

        // TODO: Notify user via email/notification that their report was affected
        // await notificationService.sendTamperingAlert(reportId, oldStatus, txStatus.status);
      } else {
        logger.debug('REPORT', 'Verification passed - DB matches blockchain', { reportId });
      }

      // Update confirmation count if changed
      if (submission.status === 'pending' && txStatus.status === 'confirmed') {
        await databaseService.updateStatus(reportId, 'confirmed', {
          blockNumber: txStatus.blockNumber
        });

        await databaseService.logAudit(
          reportId,
          'status',
          'pending',
          'confirmed',
          'blockchain_sync',
          'background_job'
        );

        logger.success('REPORT', 'Report confirmed on blockchain', {
          reportId,
          blockNumber: txStatus.blockNumber
        });
      }

    } catch (error) {
      logger.error('REPORT', 'Background verification error', {
        reportId,
        error: error.message
      });
      // Don't throw - background task failure shouldn't affect user
    }
  }

  /**
   * Archive a report
   * Hide submitted/confirmed reports without deleting them
   * Useful for user privacy while preserving blockchain immutability
   */
  async archiveReport(req, res, next) {
    try {
      const { reportId } = req.params;
      const { reason } = req.body;

      logger.logRequest('POST', `/api/report/${reportId}/archive`, { reason });

      // Get userId for security
      const userId = blockchainService.getWalletAddress();

      // Check if report exists
      const submission = await databaseService.getSubmission(reportId, userId);

      if (!submission) {
        logger.warn('REPORT', 'Report not found for archival', { reportId });
        return res.status(404).json({
          error: true,
          message: 'Report not found'
        });
      }

      // Archive the report (works for any status)
      const archived = await databaseService.archiveReport(reportId, reason);

      logger.success('REPORT', 'Report archived', {
        reportId,
        reason,
        userId
      });

      logger.logResponse('/api/report/archive', 200, 'Report archived');

      res.status(200).json({
        success: true,
        message: 'Report archived successfully (still on blockchain)',
        data: {
          reportId: archived.reportId,
          status: archived.status,
          isArchived: archived.isArchived,
          archivedAt: archived.archivedAt,
          archivedReason: archived.archivedReason
        }
      });

    } catch (error) {
      logger.error('REPORT', 'Archive failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to archive report',
        code: 'ARCHIVE_ERROR'
      });
    }
  }

  /**
   * Unarchive a report
   * Restore archived reports back to active
   */
  async unarchiveReport(req, res, next) {
    try {
      const { reportId } = req.params;

      logger.logRequest('POST', `/api/report/${reportId}/unarchive`);

      // Get userId for security
      const userId = blockchainService.getWalletAddress();

      // Check if report exists
      const submission = await databaseService.getSubmission(reportId, userId);

      if (!submission) {
        logger.warn('REPORT', 'Report not found for unarchival', { reportId });
        return res.status(404).json({
          error: true,
          message: 'Report not found'
        });
      }

      if (!submission.isarchived) {
        logger.warn('REPORT', 'Report is not archived', { reportId });
        return res.status(400).json({
          error: true,
          message: 'Report is not archived'
        });
      }

      // Unarchive the report
      const unarchived = await databaseService.unarchiveReport(reportId);

      logger.success('REPORT', 'Report unarchived', {
        reportId,
        userId
      });

      logger.logResponse('/api/report/unarchive', 200, 'Report unarchived');

      res.status(200).json({
        success: true,
        message: 'Report restored to active',
        data: {
          reportId: unarchived.reportId,
          status: unarchived.status,
          isArchived: unarchived.isarchived,
          archivedAt: unarchived.archivedat
        }
      });

    } catch (error) {
      logger.error('REPORT', 'Unarchive failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to unarchive report',
        code: 'UNARCHIVE_ERROR'
      });
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    try {
      logger.logRequest('GET', '/health');

      // Safely get blockchain info without throwing if not initialized
      let walletAddress = null;
      let contractAddress = null;
      let blockchainStatus = 'ready';

      try {
        walletAddress = blockchainService.getWalletAddress();
        contractAddress = blockchainService.getContractAddress();
      } catch (bcError) {
        logger.warn('HEALTH', 'Blockchain not initialized', { error: bcError.message });
        blockchainStatus = 'not_initialized';
      }

      // Try to get database stats
      let dbStats = null;
      let dbStatus = 'unavailable';
      try {
        dbStats = await databaseService.getStats();
        dbStatus = 'connected';
      } catch (dbError) {
        logger.warn('HEALTH', 'Database not available', {
          error: dbError.message
        });
        dbStatus = 'error';
      }

      const health = {
        status: (dbStatus === 'error' || blockchainStatus !== 'ready') ? 'degraded' : 'healthy',
        timestamp: new Date().toISOString(),
        backend: {
          wallet: walletAddress,
          contract: contractAddress
        },
        services: {
          ipfs: 'ready',
          blockchain: blockchainStatus,
          database: dbStatus
        },
        stats: dbStats || null
      };

      const statusCode = dbStatus === 'error' ? 503 : 200;
      logger.logResponse('/health', statusCode);
      res.status(statusCode).json(health);

    } catch (error) {
      logger.error('HEALTH', 'Health check failed', {
        error: error.message
      });

      res.status(503).json({
        status: 'unhealthy',
        error: error.message
      });
    }
  }

  /**
   * Get decrypted report payload
   * User must own the report or have been granted access
   * GET /api/report/:reportId/decrypt
   */
  async getDecryptedReport(req, res, next) {
    try {
      const { reportId } = req.params;
      const userId = req.user?.userId;

      logger.logRequest('GET', `/api/report/${reportId}/decrypt`, {});

      if (!userId) {
        logger.warn('REPORT', 'User not authenticated', {});
        return res.status(401).json({
          error: true,
          message: 'Authentication required'
        });
      }

      // Get submission with encryption key
      const submission = await databaseService.getSubmissionDecrypted(reportId, encryptionService);

      if (!submission) {
        logger.warn('REPORT', 'Report not found', { reportId });
        return res.status(404).json({
          error: true,
          message: 'Report not found'
        });
      }

      // Check if user owns the report (compare userId from JWT to submission userId)
      // Note: PostgreSQL returns lowercase column names, so it's submission.userid not submission.userId
      const ownsReport = submission.userid === userId;
      let hasAccess = false;

      if (!ownsReport) {
        // If user doesn't own the report, check if they have access via sharing
        const accessGrant = await databaseService.checkAccess(reportId, userId);
        hasAccess = accessGrant && accessGrant.isActive &&
                    (!accessGrant.expiresAt || new Date(accessGrant.expiresAt) > new Date());
      }

      if (!ownsReport && !hasAccess) {
        logger.warn('REPORT', 'User does not have access to report', { reportId, userId });
        return res.status(403).json({
          error: true,
          message: 'You do not have access to this report'
        });
      }

      // Decrypt the payload using encryption key
      if (!submission.reportKey) {
        logger.error('REPORT', 'Report encryption key not found', { reportId });
        return res.status(500).json({
          error: true,
          message: 'Unable to decrypt report - encryption key missing'
        });
      }

      // Decrypt the data from IPFS (encrypted payload is the raw data)
      // Note: In real implementation, you'd fetch the encrypted data from IPFS first
      // For now, we decrypt what was stored
      const decryptedPayload = await encryptionService.decryptPayload(
        submission.encryptedDataFromIPFS || '', // Would come from IPFS in real app
        submission.reportKey,
        submission.encryptionDataIv,
        submission.encryptionDataAuthTag,
        reportId
      );

      logger.success('REPORT', 'Report decrypted successfully', { reportId, userId });

      res.status(200).json({
        success: true,
        message: 'Report decrypted successfully',
        data: {
          reportId,
          status: submission.status,
          ...decryptedPayload,
          createdAt: submission.createdAt,
          confirmedAt: submission.confirmedAt
        }
      });

    } catch (error) {
      logger.error('REPORT', 'Decryption failed', {
        error: error.message
      });

      res.status(500).json({
        error: true,
        message: 'Failed to decrypt report',
        code: 'DECRYPT_FAILED'
      });
    }
  }
}

// Export singleton instance
module.exports = new ReportController();
