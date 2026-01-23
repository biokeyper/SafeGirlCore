/**
 * Report Controller
 * Orchestrates IPFS upload + blockchain submission
 * Business logic for handling report submissions
 */

const ipfsService = require('../services/ipfs');
const blockchainService = require('../services/blockchain');
const databaseService = require('../services/database');
const logger = require('../utils/logger');

class ReportController {
  /**
   * Submit a new report
   * Flow: Encrypt (done on frontend) → Upload to IPFS → Call smart contract
   */
  async submitReport(req, res, next) {
    let reportId = null;
    let ipfsHash = null;
    let txHash = null;

    try {
      const { encryptedPayload, responses, metadata } = req.body;

      // Generate unique report ID
      reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      logger.logRequest('POST', '/api/submitReport', {
        reportId,
        responseCount: responses.length,
        payloadSize: encryptedPayload.length
      });

      // ========== STEP 1: Convert payload to Buffer ==========
      logger.info('REPORT', 'Converting payload to buffer', { reportId });

      let payloadBuffer;
      if (typeof encryptedPayload === 'string') {
        // If it's a hex string (0x...), convert it
        if (encryptedPayload.startsWith('0x')) {
          payloadBuffer = Buffer.from(encryptedPayload.slice(2), 'hex');
        } else {
          // Assume it's base64 or raw string
          payloadBuffer = Buffer.from(encryptedPayload, 'utf8');
        }
      } else if (Buffer.isBuffer(encryptedPayload)) {
        payloadBuffer = encryptedPayload;
      } else {
        throw new Error('Invalid payload format');
      }

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
        responseCount: responses.length
      });

      const blockchainResult = await blockchainService.submitReport(ipfsHash, responses);

      txHash = blockchainResult.txHash;

      logger.success('REPORT', 'Blockchain submission successful', {
        reportId,
        txHash,
        blockNumber: blockchainResult.blockNumber
      });

      // ========== STEP 4: Save to Database ==========
      logger.info('REPORT', 'Saving to database', { reportId, txHash });

      let dbRecord = null;
      try {
        dbRecord = await databaseService.saveSubmission({
          reportId,
          txHash,
          ipfsHash,
          responses,
          blockNumber: blockchainResult.blockNumber,
          gasUsed: blockchainResult.gasUsed,
          metadata
        });

        logger.success('REPORT', 'Saved to database', {
          reportId,
          dbId: dbRecord.id
        });
      } catch (dbError) {
        logger.warn('REPORT', 'Database save failed (non-blocking)', {
          reportId,
          error: dbError.message
        });
        // Don't fail the submission if DB is down - blockchain is source of truth
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

      // Query database for submission
      const submission = await databaseService.getSubmission(reportId);

      if (!submission) {
        logger.warn('REPORT', 'Report not found', { reportId });
        return res.status(404).json({
          error: true,
          reportId,
          message: 'Report not found'
        });
      }

      // If status is pending, check blockchain for confirmation
      if (submission.status === 'pending' && submission.txHash) {
        try {
          const txStatus = await blockchainService.getTransactionStatus(submission.txHash);

          // Update status in database if confirmed
          if (txStatus.status === 'confirmed' && submission.status !== 'confirmed') {
            await databaseService.updateStatus(reportId, 'confirmed', {
              blockNumber: txStatus.blockNumber
            });
            submission.status = 'confirmed';
            submission.confirmations = txStatus.confirmations;
          } else if (txStatus.status === 'confirmed') {
            submission.confirmations = txStatus.confirmations;
          }
        } catch (blockchainError) {
          logger.warn('REPORT', 'Could not check blockchain status', {
            reportId,
            error: blockchainError.message
          });
          // Still return DB status, just warn
        }
      }

      // Build response
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
      res.status(200).json(statusResponse);

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
   * Health check endpoint
   */
  async healthCheck(req, res) {
    try {
      logger.logRequest('GET', '/health');

      const walletAddress = blockchainService.getWalletAddress();
      const contractAddress = blockchainService.getContractAddress();

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
        status: dbStatus === 'error' ? 'degraded' : 'healthy',
        timestamp: new Date().toISOString(),
        backend: {
          wallet: walletAddress,
          contract: contractAddress
        },
        services: {
          ipfs: 'ready',
          blockchain: 'ready',
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
}

// Export singleton instance
module.exports = new ReportController();
