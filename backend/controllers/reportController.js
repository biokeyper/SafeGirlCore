/**
 * Report Controller
 * Handles submission, status, archival, and decryption flows for reports.
 */

const ipfsService = require("../services/ipfs");
const blockchainService = require("../services/blockchain");
const databaseService = require("../services/database");
const encryptionService = require("../services/encryption");
const logger = require("../utils/logger");

class ReportController {
  async submitReport(req, res, next) {
    let reportId = null;
    let ipfsHash = null;
    let audioIpfsHash = null;
    let txHash = null;

    try {
      const { payload: payloadString } = req.body;
      const audioFile = req.file; // multer provides the audio file here
      const userId = req.user?.userId;

      // Parse payload JSON string
      const payloadObj =
        typeof payloadString === "string"
          ? JSON.parse(payloadString)
          : payloadString;

      let { payload, responses, metadata } = payloadObj;

      // Handle frontend sending metadata/responses nested in payload
      if (payload && !responses && payload.responses) {
        responses = payload.responses;
      }
      if (payload && !metadata && payload.metadata) {
        metadata = payload.metadata;
      }

      if (!userId) {
        return res.status(401).json({
          error: true,
          message: "Authentication required",
        });
      }

      // Generate unique report ID
      reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      logger.logRequest("POST", "/api/submitReport", {
        reportId,
        responseCount: responses ? responses.length : 0,
        hasPayload: !!payload,
        hasMetadata: !!metadata,
      });

      // Encrypt payload before storing it on IPFS.
      logger.info("REPORT", "Encrypting payload with backend key", {
        reportId,
      });

      const encryptionResult = await encryptionService.encryptPayload(
        { payload, responses, metadata },
        reportId,
      );

      // Encrypt the report key with master key for secure storage
      const keyEncryption = encryptionService.encryptKey(
        encryptionResult.reportKey,
        reportId,
      );

      logger.info("REPORT", "Payload encrypted and key secured", {
        reportId,
        encryptedSize: encryptionResult.encryptedData.length,
      });

      // Convert encrypted data to buffer for IPFS upload
      const payloadBuffer = Buffer.from(encryptionResult.encryptedData, "hex");

      // Upload encrypted payload to IPFS.
      logger.info("REPORT", "Uploading to IPFS", {
        reportId,
        payloadSize: payloadBuffer.length,
      });

      ipfsHash = await ipfsService.uploadToIPFS(
        payloadBuffer,
        `report_${reportId}.bin`,
      );

      logger.success("REPORT", "IPFS upload successful", {
        reportId,
        ipfsHash,
      });

      // Upload audio separately when present.
      if (audioFile) {
        logger.info("REPORT", "Uploading audio to IPFS", {
          reportId,
          audioSize: audioFile.size,
          mimeType: audioFile.mimetype,
        });

        audioIpfsHash = await ipfsService.uploadToIPFS(
          audioFile.buffer,
          `audio_${reportId}.m4a`,
        );

        logger.success("REPORT", "Audio IPFS upload successful", {
          reportId,
          audioIpfsHash,
        });

        // Store audio hash and gateway URL in metadata for later retrieval
        if (!metadata) {
          metadata = {};
        }
        metadata.audioIpfsHash = audioIpfsHash;
        metadata.audioGatewayUrl = `https://gateway.pinata.cloud/ipfs/${audioIpfsHash}`;
      }

      // Submit report metadata to the smart contract.
      logger.info("REPORT", "Submitting to blockchain", {
        reportId,
        ipfsHash,
        responseCount: responses ? responses.length : 0,
      });

      const blockchainResult = await blockchainService.submitReport(
        ipfsHash,
        responses || [],
        userId,
      );

      txHash = blockchainResult.txHash;

      logger.success("REPORT", "Blockchain submission successful", {
        reportId,
        txHash,
        blockNumber: blockchainResult.blockNumber,
      });

      // Persist synchronized submission record in the database.
      logger.info("REPORT", "Saving to database", { reportId, txHash });

      let dbRecord;
      try {
        dbRecord = await databaseService.saveSubmission({
          reportId,
          txHash,
          ipfsHash,
          responses,
          blockNumber: blockchainResult.blockNumber,
          gasUsed: blockchainResult.gasUsed,
          status: "pending", // Waiting for blockchain confirmations
          metadata,
          userId,
          // Encryption key information (backend-encrypted)
          encryptionKey: keyEncryption.encryptedKey,
          encryptionKeyIv: keyEncryption.keyIv,
          encryptionKeyAuthTag: keyEncryption.keyAuthTag,
          encryptionDataIv: encryptionResult.iv,
          encryptionDataAuthTag: encryptionResult.authTag,
        });

        logger.success("REPORT", "Saved to database", {
          reportId,
          dbId: dbRecord.id,
        });

        // Create notification for user
        await databaseService.createNotification({
          userId,
          type: "report_submitted",
          title: "Report Submitted",
          message: "Your report has been submitted successfully.",
          relatedId: reportId,
        });

        logger.success("REPORT", "Notification created", { reportId, userId });
      } catch (dbError) {
        logger.error("REPORT", "Database save failed - blocking submission", {
          reportId,
          txHash,
          error: dbError.message,
        });

        // Blockchain write succeeded but DB write failed: treat as sync failure.
        const dbSyncError = new Error(
          `Database synchronization failed. Report recorded on blockchain (${txHash}) but not in database. ` +
            `Please contact support with txHash.`,
        );
        dbSyncError.code = "DB_SYNC_FAILED";
        throw dbSyncError;
      }

      // Return one canonical payload shape: success + message + data.
      const successData = {
        reportId,
        txHash,
        ipfsHash,
        ipfsGatewayUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
        ...(audioIpfsHash && {
          audioIpfsHash,
          audioGatewayUrl: `https://gateway.pinata.cloud/ipfs/${audioIpfsHash}`,
        }),
        type: metadata?.type || "text",
        status: "pending",
        confirmations: 0,
        blockNumber: blockchainResult.blockNumber,
        gasUsed: blockchainResult.gasUsed,
        timestamp: new Date().toISOString(),
        dbId: dbRecord?.id,
      };

      const successResponse = {
        success: true,
        message:
          "Report submitted successfully, waiting for blockchain confirmations",
        data: successData,
      };

      logger.logResponse("/api/submitReport", 200, "Report submitted");
      res.status(200).json(successResponse);
    } catch (error) {
      logger.error("REPORT", "Submission failed", {
        reportId,
        ipfsHash,
        txHash,
        errorMessage: error.message,
        errorCode: error.code,
      });

      let userMessage =
        "An error occurred while submitting your report. Please try again.";
      let statusCode = 500;

      if (error.code === "DB_SYNC_FAILED") {
        userMessage =
          "Report reached blockchain, but backend sync failed. Please contact support with the transaction hash.";
        statusCode = 503;
      } else if (error.message.includes("validation")) {
        userMessage = "Invalid report data. Please check and try again.";
        statusCode = 400;
      } else if (error.message.includes("IPFS")) {
        userMessage = "Network error. Please try again.";
        statusCode = 503;
      } else if (error.message.includes("Timeout")) {
        userMessage = "Request timed out. Please try again.";
        statusCode = 504;
      }

      const errorResponse = {
        error: true,
        reportId,
        message: userMessage,
        code: error.code || "SUBMISSION_ERROR",
        ...(txHash && { txHash }),
      };

      logger.logResponse("/api/submitReport", statusCode, error.message);
      res.status(statusCode).json(errorResponse);
    }
  }

  /**
   * Get status of a submitted report
   */
  async getReportStatus(req, res, next) {
    try {
      const { reportId } = req.query;
      const userId = req.user?.userId;

      logger.logRequest("GET", `/api/reportStatus?reportId=${reportId}`);

      if (!userId) {
        logger.warn("REPORT", "User not authenticated", {});
        return res.status(401).json({
          error: true,
          message: "Authentication required",
        });
      }

      // Query database for submission (fast)
      // Pass userId to decrypt responses and metadata
      const submission = await databaseService.getSubmission(reportId, userId);

      if (!submission) {
        logger.warn("REPORT", "Report not found", { reportId });
        return res.status(404).json({
          error: true,
          reportId,
          message: "Report not found",
        });
      }

      const statusResponse = {
        success: true,
        reportId,
        status: submission.status,
        message: `Report status: ${submission.status}`,
        data: {
          reportId: submission.reportid || submission.reportId,
          status: submission.status,
          type: submission.type || "text",
          txHash: submission.txhash || submission.txHash,
          ipfsHash: submission.ipfshash || submission.ipfsHash,
          blockNumber: submission.blocknumber || submission.blockNumber,
          confirmations: submission.confirmations || 0,
          createdAt: submission.createdat || submission.createdAt,
          submittedAt: submission.submittedat || submission.submittedAt,
          gasUsed: submission.gasused || submission.gasUsed,
          isArchived: submission.isarchived || submission.isArchived,
        },
      };

      logger.logResponse("/api/reportStatus", 200);
      res.status(200).json(statusResponse);

      // Run consistency checks in the background after responding.
      if (submission.userid || submission.userId) {
        this.verifyAndFixInBackground(reportId, submission).catch((err) => {
          logger.warn("REPORT", "Background verification failed", {
            reportId,
            error: err.message,
          });
        });
      }
    } catch (error) {
      logger.error("REPORT", "Status check failed", {
        error: error.message,
      });

      res.status(500).json({
        error: true,
        message: "Failed to get report status",
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
      logger.debug("REPORT", "Starting background verification", { reportId });

      const userId = submission.userid || submission.userId;
      if (!userId) {
        logger.warn(
          "REPORT",
          "Skipping background verification: missing userId",
          { reportId },
        );
        return;
      }

      // Query blockchain contract state
      const contractStatus =
        await blockchainService.getReportStatusFromContract(userId);

      // Contract state is the source of truth
      const blockchainStatus = contractStatus.exists
        ? "submitted"
        : "not_found";

      // Check for data tampering (DB status should match blockchain)
      if (
        blockchainStatus === "submitted" &&
        submission.status !== "submitted"
      ) {
        logger.error(
          "SECURITY",
          "TAMPERING DETECTED - DB does not match blockchain",
          {
            reportId,
            dbStatus: submission.status,
            blockchainStatus: "submitted",
          },
        );

        // Log the tampering alert
        await databaseService.logTamperingAlert(
          reportId,
          submission.status,
          "submitted",
        );

        // Log audit entry for the discrepancy
        await databaseService.logAudit(
          reportId,
          "status",
          submission.status,
          "submitted",
          "tampering_detected",
          "background_verification",
        );

        // Fix the database using blockchain (source of truth)
        const oldStatus = submission.status;
        await databaseService.updateStatus(reportId, "submitted", {
          timestamp: contractStatus.timestamp,
        });

        // Log the correction
        await databaseService.logAudit(
          reportId,
          "status",
          oldStatus,
          "submitted",
          "tampering_detected",
          "background_job",
        );

        // Mark alert as corrected
        await databaseService.markAlertCorrected(reportId);

        logger.success("SECURITY", "Tampering corrected", {
          reportId,
          correctedFrom: oldStatus,
          correctedTo: "submitted",
        });
      } else {
        logger.debug("REPORT", "Verification passed - DB matches blockchain", {
          reportId,
        });
      }

      // Update DB if report is submitted in contract but DB still shows pending
      if (submission.status === "pending" && blockchainStatus === "submitted") {
        await databaseService.updateStatus(reportId, "submitted", {
          timestamp: contractStatus.timestamp,
        });

        await databaseService.logAudit(
          reportId,
          "status",
          "pending",
          "submitted",
          "blockchain_sync",
          "background_job",
        );

        logger.success("REPORT", "Report submitted on blockchain", {
          reportId,
          timestamp: contractStatus.timestamp,
          ipfsHash: contractStatus.ipfsHash,
        });
      }
    } catch (error) {
      logger.error("REPORT", "Background verification error", {
        reportId,
        error: error.message,
      });
    }
  }

  /**
   * Archive a report
   * Hide submitted/submitted reports without deleting them
   * Useful for user privacy while preserving blockchain immutability
   */
  async archiveReport(req, res, next) {
    try {
      const { reportId } = req.params;
      const { reason } = req.body;
      const userId = req.user?.userId;

      logger.logRequest("POST", `/api/report/${reportId}/archive`, { reason });

      if (!userId) {
        logger.warn("REPORT", "User not authenticated", {});
        return res.status(401).json({
          error: true,
          message: "Authentication required",
        });
      }

      // Check if report exists
      const submission = await databaseService.getSubmission(reportId, userId);

      if (!submission) {
        logger.warn("REPORT", "Report not found for archival", { reportId });
        return res.status(404).json({
          error: true,
          message: "Report not found",
        });
      }

      // Archive the report (works for any status)
      const archived = await databaseService.archiveReport(reportId, reason);

      logger.success("REPORT", "Report archived", {
        reportId,
        reason,
        userId,
      });

      logger.logResponse("/api/report/archive", 200, "Report archived");

      res.status(200).json({
        success: true,
        message: "Report archived successfully (still on blockchain)",
        data: {
          reportId: archived.reportid || archived.reportId,
          status: archived.status,
          isArchived: archived.isarchived || archived.isArchived,
          archivedAt: archived.archivedat || archived.archivedAt,
          archivedReason: archived.archivedreason || archived.archivedReason,
        },
      });
    } catch (error) {
      logger.error("REPORT", "Archive failed", {
        error: error.message,
      });

      res.status(500).json({
        error: true,
        message: "Failed to archive report",
        code: "ARCHIVE_ERROR",
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
      const userId = req.user?.userId;

      logger.logRequest("POST", `/api/report/${reportId}/unarchive`);

      if (!userId) {
        logger.warn("REPORT", "User not authenticated", {});
        return res.status(401).json({
          error: true,
          message: "Authentication required",
        });
      }

      // Check if report exists
      const submission = await databaseService.getSubmission(reportId, userId);

      if (!submission) {
        logger.warn("REPORT", "Report not found for unarchival", { reportId });
        return res.status(404).json({
          error: true,
          message: "Report not found",
        });
      }

      if (!submission.isarchived) {
        logger.warn("REPORT", "Report is not archived", { reportId });
        return res.status(400).json({
          error: true,
          message: "Report is not archived",
        });
      }

      // Unarchive the report
      const unarchived = await databaseService.unarchiveReport(reportId);

      logger.success("REPORT", "Report unarchived", {
        reportId,
        userId,
      });

      logger.logResponse("/api/report/unarchive", 200, "Report unarchived");

      res.status(200).json({
        success: true,
        message: "Report restored to active",
        data: {
          reportId: unarchived.reportid || unarchived.reportId,
          status: unarchived.status,
          isArchived: unarchived.isarchived || unarchived.isArchived,
          archivedAt: unarchived.archivedat || unarchived.archivedAt,
        },
      });
    } catch (error) {
      logger.error("REPORT", "Unarchive failed", {
        error: error.message,
      });

      res.status(500).json({
        error: true,
        message: "Failed to unarchive report",
        code: "UNARCHIVE_ERROR",
      });
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    try {
      logger.logRequest("GET", "/health");

      // Safely get blockchain info without throwing if not initialized
      let walletAddress = null;
      let contractAddress = null;
      let blockchainStatus = "ready";

      try {
        walletAddress = blockchainService.getWalletAddress();
        contractAddress = blockchainService.getContractAddress();
      } catch (bcError) {
        logger.warn("HEALTH", "Blockchain not initialized", {
          error: bcError.message,
        });
        blockchainStatus = "not_initialized";
      }

      // Try to get database stats
      let dbStats = null;
      let dbStatus = "unavailable";
      try {
        dbStats = await databaseService.getStats();
        dbStatus = "connected";
      } catch (dbError) {
        logger.warn("HEALTH", "Database not available", {
          error: dbError.message,
        });
        dbStatus = "error";
      }

      const health = {
        status:
          dbStatus === "error" || blockchainStatus !== "ready"
            ? "degraded"
            : "healthy",
        timestamp: new Date().toISOString(),
        backend: {
          wallet: walletAddress,
          contract: contractAddress,
        },
        services: {
          ipfs: "ready",
          blockchain: blockchainStatus,
          database: dbStatus,
        },
        stats: dbStats || null,
      };

      const statusCode = dbStatus === "error" ? 503 : 200;
      logger.logResponse("/health", statusCode);
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error("HEALTH", "Health check failed", {
        error: error.message,
      });

      res.status(503).json({
        status: "unhealthy",
        error: error.message,
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

      logger.logRequest("GET", `/api/report/${reportId}/decrypt`, {});

      if (!userId) {
        logger.warn("REPORT", "User not authenticated", {});
        return res.status(401).json({
          error: true,
          message: "Authentication required",
        });
      }

      // Get submission with encryption key
      const submission = await databaseService.getSubmissionDecrypted(
        reportId,
        encryptionService,
      );

      if (!submission) {
        logger.warn("REPORT", "Report not found", { reportId });
        return res.status(404).json({
          error: true,
          message: "Report not found",
        });
      }

      // Check if user owns the report (compare userId from JWT to submission userId)
      const ownsReport = submission.userid === userId;
      let hasAccess = false;

      if (!ownsReport) {
        // If user doesn't own the report, check if they have access via sharing
        const accessGrant = await databaseService.checkAccess(reportId, userId);
        hasAccess =
          accessGrant &&
          accessGrant.isActive &&
          (!accessGrant.expiresAt ||
            new Date(accessGrant.expiresAt) > new Date());
      }

      if (!ownsReport && !hasAccess) {
        logger.warn("REPORT", "User does not have access to report", {
          reportId,
          userId,
        });
        return res.status(403).json({
          error: true,
          message: "You do not have access to this report",
        });
      }

      // Decrypt the payload using encryption key
      if (!submission.reportKey) {
        logger.error("REPORT", "Report encryption key not found", { reportId });
        return res.status(500).json({
          error: true,
          message: "Unable to decrypt report - encryption key missing",
        });
      }

      // Fetch encrypted data from IPFS
      logger.info("REPORT", "Fetching encrypted data from IPFS", {
        ipfsHash: submission.ipfshash,
      });
      const encryptedData = await ipfsService.downloadFromIPFS(
        submission.ipfshash,
      );

      // Decrypt the data
      const decryptedPayload = await encryptionService.decryptPayload(
        encryptedData,
        submission.reportKey,
        submission.encryptiondataiv,
        submission.encryptiondataauthtag,
        reportId,
      );

      logger.success("REPORT", "Report decrypted successfully", {
        reportId,
        userId,
      });

      res.status(200).json({
        success: true,
        message: "Report decrypted successfully",
        data: {
          reportId,
          status: submission.status,
          ...decryptedPayload,
          timestamps: {
            createdAt: submission.createdat,
            submittedAt: submission.createdat,
            submittedAt: submission.submittedat,
            updatedAt: submission.updatedat,
          },
        },
      });
    } catch (error) {
      logger.error("REPORT", "Decryption failed", {
        error: error.message,
      });

      res.status(500).json({
        error: true,
        message: "Failed to decrypt report",
        code: "DECRYPT_FAILED",
      });
    }
  }
}

module.exports = new ReportController();
