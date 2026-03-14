/**
 * Database Service
 * Handles all PostgreSQL queries for submissions
 * Includes encryption/decryption of sensitive data
 */

const logger = require('../utils/logger');
const crypto = require('crypto');
const encryptionService = require('./encryption');
const ipfsService = require('./ipfs');

class DatabaseService {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    // Master encryption key from environment
    // Should be stored securely (AWS Secrets Manager, HashiCorp Vault, etc.)
    this.masterKey = process.env.DB_ENCRYPTION_KEY;

    if (!this.masterKey) {
      logger.warn('DATABASE', 'DB_ENCRYPTION_KEY not set - encryption disabled');
    }
  }

  /**
   * Derive encryption key from userId + master key
   * Each user gets unique encryption key
   * @private
   */
  deriveUserKey(userId) {
    if (!this.masterKey) {
      return null;
    }

    // Create unique key for each user
    // Hash(masterKey + userId) = user-specific encryption key
    return crypto
      .createHmac('sha256', this.masterKey)
      .update(userId.toString())
      .digest();
  }

  /**
   * Encrypt sensitive data using userId-based key
   * @private
   */
  encrypt(data, userId) {
    try {
      if (!this.masterKey || !data) {
        return data; // If no key, return plaintext (fallback)
      }

      const userKey = this.deriveUserKey(userId);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', userKey, iv);

      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Return: iv + encrypted data (iv needed for decryption)
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      logger.error('DATABASE', 'Encryption failed', {
        error: error.message,
        userId
      });
      return data; // Fallback to plaintext on error
    }
  }

  /**
   * Decrypt sensitive data using userId-based key
   * @private
   */
  decrypt(encryptedData, userId) {
    try {
      if (!this.masterKey || !encryptedData) {
        return encryptedData;
      }

      // Extract iv and encrypted data
      const [ivHex, encrypted] = encryptedData.split(':');
      if (!ivHex || !encrypted) {
        // Data not encrypted, return as-is
        return encryptedData;
      }

      const userKey = this.deriveUserKey(userId);
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', userKey, iv);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('DATABASE', 'Decryption failed', {
        error: error.message,
        userId
      });
      // Return encrypted data if decryption fails (something is wrong)
      return encryptedData;
    }
  }

  /**
   * Initialize database connection
   * Must be called before using database methods
   */
  async initialize() {
    try {
      const databaseUrl = process.env.DATABASE_URL;

      if (!databaseUrl) {
        logger.warn('DATABASE', 'DATABASE_URL not set, skipping database initialization');
        return false;
      }

      // Import pg dynamically (only if DATABASE_URL is set)
      const { Pool } = require('pg');

      this.pool = new Pool({
        connectionString: databaseUrl,
        max: 10, // Max connections in pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      logger.success('DATABASE', 'Connected to PostgreSQL', {
        url: databaseUrl.split('@')[1] // Log only the host part, hide password
      });

      return true;
    } catch (error) {
      logger.error('DATABASE', 'Failed to initialize database', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Save a new submission
   * @param {object} submission - { reportId, txHash, ipfsHash, responses, blockNumber, gasUsed, userId }
   * @returns {Promise<object>} Saved record
   */
  async saveSubmission(submission) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not initialized');
      }

      const {
        reportId,
        txHash,
        ipfsHash,
        responses,
        blockNumber,
        gasUsed,
        status = 'pending',
        metadata = null,
        userId = null,
        // Backend encryption fields
        encryptionKey = null,
        encryptionKeyIv = null,
        encryptionKeyAuthTag = null,
        encryptionDataIv = null,
        encryptionDataAuthTag = null
      } = submission;

      logger.info('DATABASE', 'Saving submission', { reportId });

      // Extract type from metadata (audio or text)
      const reportType = metadata?.type || 'text';

      // Note: Payload is now encrypted by encryption service
      // Store encryption key info for decryption later
      const query = `
        INSERT INTO submissions (
          reportId, txHash, ipfsHash, responses,
          blockNumber, gasUsed, status, confirmations, metadata, userid, type,
          encryptionKey, encryptionKeyIv, encryptionKeyAuthTag,
          encryptionDataIv, encryptionDataAuthTag
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *;
      `;

      const result = await this.pool.query(query, [
        reportId,
        txHash,
        ipfsHash,
        responses ? JSON.stringify(responses) : null,
        blockNumber,
        gasUsed,
        status,
        0, // confirmations - starts at 0
        metadata ? JSON.stringify(metadata) : null,
        userId,
        reportType,
        encryptionKey,
        encryptionKeyIv,
        encryptionKeyAuthTag,
        encryptionDataIv,
        encryptionDataAuthTag
      ]);

      logger.success('DATABASE', 'Submission saved with encryption keys', { reportId });
      return result.rows[0];

    } catch (error) {
      logger.error('DATABASE', 'Failed to save submission', {
        error: error.message,
        reportId: submission.reportId
      });
      throw error;
    }
  }

  /**
   * Get submission by reportId with decryption
   * @param {string} reportId - Report ID
   * @param {string} userId - User ID (optional for access checking)
   * @param {boolean} decrypt - Whether to decrypt the payload (default false)
   * @returns {Promise<object>} Submission record or null
   */
  async getSubmission(reportId, userId = null, decrypt = false) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not initialized');
      }

      console.log('\n🔍 DATABASE.getSubmission() called');
      console.log('   reportId:', reportId);
      console.log('   userId:', userId);

      logger.debug('DATABASE', 'Fetching submission', { reportId, userId });

      const query = 'SELECT * FROM submissions WHERE reportid = $1;';
      const result = await this.pool.query(query, [reportId]);

      if (result.rows.length === 0) {
        console.log('❌ Report not found in database');
        logger.warn('DATABASE', 'Submission not found', { reportId });
        return null;
      }

      let submission = result.rows[0];
      console.log('✅ Report found in database');
      console.log('   Report owner (userid):', submission.userid);

      // ========== VALIDATE OWNERSHIP ==========
      // If userId is provided, ensure user owns the report or has access to it
      if (userId) {
        const userOwnedReport = submission.userid === userId;
        console.log('   User-specific access check:');
        console.log('      userId:', userId);
        console.log('      submission.userid:', submission.userid);
        console.log('      User owns report?', userOwnedReport);

        let userHasSharedAccess = false;

        // Check if user has been granted access to this report
        if (!userOwnedReport) {
          console.log('      User does not own report, checking shared access...');
          const accessQuery = `
            SELECT id FROM report_access
            WHERE reportid = $1 AND viewerid = $2 AND isactive = TRUE
            AND (expiresat IS NULL OR expiresat > NOW())
          `;
          const accessResult = await this.pool.query(accessQuery, [reportId, userId]);
          userHasSharedAccess = accessResult.rows.length > 0;
          console.log('      User has shared access?', userHasSharedAccess);
        }

        if (!userOwnedReport && !userHasSharedAccess) {
          console.log('❌ User does NOT have access to this report - BLOCKED');
          logger.warn('DATABASE', 'User does not have access to report', { reportId, userId });
          return null;
        }

        console.log('✅ User has valid access to report');
      }

      // ========== FETCH FROM IPFS IF RESPONSES ARE NULL ==========
      // Content is stored encrypted on IPFS, not in database
      if (!submission.responses && !submission.metadata && submission.ipfshash && submission.encryptionkey) {
        try {
          logger.info('DATABASE', 'Responses/metadata null - fetching from IPFS', { reportId, ipfsHash: submission.ipfshash });

          // Download encrypted data from IPFS
          const encryptedDataHex = await ipfsService.downloadFromIPFS(submission.ipfshash);

          // Decrypt the encryption key (note: PostgreSQL returns lowercase column names)
          const reportKey = encryptionService.decryptKey(
            submission.encryptionkey || submission.encryptionKey,
            submission.encryptionkeyiv || submission.encryptionKeyIv,
            submission.encryptionkeyauthtag || submission.encryptionKeyAuthTag,
            reportId
          );

          // Decrypt the payload
          const decrypted = await encryptionService.decryptPayload(
            encryptedDataHex,
            reportKey,
            submission.encryptiondataiv || submission.encryptionDataIv,
            submission.encryptiondataauthtag || submission.encryptionDataAuthTag,
            reportId
          );

          // Extract responses and metadata from decrypted payload
          submission.responses = decrypted.responses || null;
          submission.metadata = decrypted.metadata || null;

          logger.success('DATABASE', 'Fetched and decrypted payload from IPFS', { reportId });
        } catch (ipfsError) {
          logger.warn('DATABASE', 'Failed to fetch from IPFS', {
            reportId,
            error: ipfsError.message
          });
          // Continue with null responses/metadata if IPFS fails
        }
      }

      logger.success('DATABASE', 'Submission retrieved', { reportId });
      return submission;

    } catch (error) {
      logger.error('DATABASE', 'Failed to get submission', {
        error: error.message,
        reportId
      });
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<object|null>} User record or null if not found
   */
  async getUser(userId) {
    try {
      const result = await this.query(
        'SELECT userid, phone, email, pin FROM users WHERE userid = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('DATABASE', 'Failed to get user', {
        error: error.message,
        userId
      });
      return null;
    }
  }

  /**
   * Update submission status
   * @param {string} reportId - Report ID
   * @param {string} status - New status (pending, confirmed, failed)
   * @param {object} updateData - Additional data to update
   * @returns {Promise<object>} Updated record
   */
  async updateStatus(reportId, status, updateData = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not initialized');
      }

      logger.info('DATABASE', 'Updating submission status', {
        reportId,
        newStatus: status
      });

      let query = `
        UPDATE submissions
        SET status = $2,
            updatedAt = CURRENT_TIMESTAMP
      `;

      const params = [reportId, status];

      // Add confirmedAt if status is confirmed
      if (status === 'confirmed') {
        query += ', confirmedAt = CURRENT_TIMESTAMP';
      }

      // Add blockNumber if provided
      if (updateData.blockNumber) {
        params.push(updateData.blockNumber);
        query += `, blockNumber = $${params.length}`;
      }

      // Add gasUsed if provided
      if (updateData.gasUsed) {
        params.push(updateData.gasUsed);
        query += `, gasUsed = $${params.length}`;
      }

      query += ' WHERE reportId = $1 RETURNING *;';

      const result = await this.pool.query(query, params);

      if (result.rows.length === 0) {
        logger.warn('DATABASE', 'Submission not found for update', { reportId });
        return null;
      }

      logger.success('DATABASE', 'Status updated', {
        reportId,
        status,
        blockNumber: updateData.blockNumber
      });

      return result.rows[0];

    } catch (error) {
      logger.error('DATABASE', 'Failed to update status', {
        error: error.message,
        reportId,
        status
      });
      throw error;
    }
  }

  /**
   * Get all submissions with optional filters
   * @param {object} filters - { status, limit, offset, userId }
   * @returns {Promise<array>} Array of submissions with decrypted data
   */
  async getSubmissions(filters = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not initialized');
      }

      const { status = null, limit = 50, offset = 0, userId = null } = filters;

      logger.debug('DATABASE', 'Fetching submissions', { status, limit, offset });

      let query = 'SELECT * FROM submissions';
      const params = [];

      if (status) {
        params.push(status);
        query += ` WHERE status = $${params.length}`;
      }

      query += ' ORDER BY createdAt DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2) + ';';
      params.push(limit, offset);

      const result = await this.pool.query(query, params);

      // ========== DECRYPT SENSITIVE DATA ==========
      const submissions = result.rows.map(submission => {
        if (submission.responses) {
          submission.responses = this.decrypt(submission.responses, userId || submission.reportId);
        }
        if (submission.metadata) {
          submission.metadata = this.decrypt(submission.metadata, userId || submission.reportId);
        }
        return submission;
      });

      logger.success('DATABASE', 'Submissions retrieved (decrypted)', {
        count: submissions.length,
        status
      });

      return submissions;

    } catch (error) {
      logger.error('DATABASE', 'Failed to fetch submissions', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get submission statistics
   * @returns {Promise<object>} Stats { total, pending, confirmed, failed }
   */
  async getStats() {
    try {
      if (!this.isConnected) {
        throw new Error('Database not initialized');
      }

      const query = `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)::INT as pending,
          SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END)::INT as confirmed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::INT as failed
        FROM submissions;
      `;

      const result = await this.pool.query(query);
      const stats = result.rows[0];

      logger.success('DATABASE', 'Stats retrieved', stats);
      return stats;

    } catch (error) {
      logger.error('DATABASE', 'Failed to get stats', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Log a change to the audit trail
   * @param {string} reportId - Report ID
   * @param {string} fieldChanged - Field that changed
   * @param {string} oldValue - Previous value
   * @param {string} newValue - New value
   * @param {string} changeReason - Why it changed (api_update, blockchain_sync, tampering_detected)
   * @param {string} changedBy - Who made the change (system, api, background_job)
   */
  async logAudit(reportId, fieldChanged, oldValue, newValue, changeReason = 'unknown', changedBy = 'system') {
    try {
      if (!this.isConnected) {
        logger.warn('DATABASE', 'Cannot log audit - not connected');
        return;
      }

      const query = `
        INSERT INTO submission_audit_log
        (reportId, fieldChanged, oldValue, newValue, changeReason, changedBy)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;

      await this.pool.query(query, [
        reportId,
        fieldChanged,
        oldValue?.toString() || null,
        newValue?.toString() || null,
        changeReason,
        changedBy
      ]);

      logger.debug('DATABASE', 'Audit logged', {
        reportId,
        field: fieldChanged,
        reason: changeReason
      });
    } catch (error) {
      logger.error('DATABASE', 'Failed to log audit', {
        error: error.message,
        reportId
      });
    }
  }

  /**
   * Record a tampering alert
   * @param {string} reportId - Report ID
   * @param {string} dbValue - Value in database
   * @param {string} blockchainValue - Value on blockchain
   */
  async logTamperingAlert(reportId, dbValue, blockchainValue) {
    try {
      if (!this.isConnected) {
        logger.warn('DATABASE', 'Cannot log tampering alert - not connected');
        return;
      }

      const query = `
        INSERT INTO tampering_alerts
        (reportId, dbValue, blockchainValue, correctionApplied)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (reportId) DO UPDATE
        SET dbValue = $2, blockchainValue = $3, detectedAt = CURRENT_TIMESTAMP
      `;

      await this.pool.query(query, [
        reportId,
        dbValue,
        blockchainValue,
        false
      ]);

      logger.error('DATABASE', 'TAMPERING ALERT LOGGED', {
        reportId,
        dbValue,
        blockchainValue
      });
    } catch (error) {
      logger.error('DATABASE', 'Failed to log tampering alert', {
        error: error.message,
        reportId
      });
    }
  }

  /**
   * Mark tampering alert as corrected
   * @param {string} reportId - Report ID
   */
  async markAlertCorrected(reportId) {
    try {
      if (!this.isConnected) {
        logger.warn('DATABASE', 'Cannot update alert - not connected');
        return;
      }

      const query = `
        UPDATE tampering_alerts
        SET correctionApplied = TRUE, correctedAt = CURRENT_TIMESTAMP
        WHERE reportId = $1
      `;

      await this.pool.query(query, [reportId]);

      logger.info('DATABASE', 'Tampering alert marked as corrected', { reportId });
    } catch (error) {
      logger.error('DATABASE', 'Failed to mark alert corrected', {
        error: error.message,
        reportId
      });
    }
  }

  /**
   * Get audit history for a report
   * @param {string} reportId - Report ID
   * @returns {Promise<array>} Audit entries
   */
  async getAuditHistory(reportId) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not initialized');
      }

      const query = `
        SELECT * FROM submission_audit_log
        WHERE reportId = $1
        ORDER BY changedAt DESC
      `;

      const result = await this.pool.query(query, [reportId]);
      return result.rows;
    } catch (error) {
      logger.error('DATABASE', 'Failed to get audit history', {
        error: error.message,
        reportId
      });
      throw error;
    }
  }

  /**
   * Archive a report (hide from list but keep for blockchain verification)
   * @param {string} reportId - Report ID to archive
   * @param {string} reason - Reason for archival
   * @returns {Promise<object>} Archived submission
   */
  async archiveReport(reportId, reason = null) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not initialized');
      }

      logger.info('DATABASE', 'Archiving report', { reportId, reason });

      const query = `
        UPDATE submissions
        SET isArchived = TRUE,
            archivedAt = CURRENT_TIMESTAMP,
            archivedReason = $2,
            updatedAt = CURRENT_TIMESTAMP
        WHERE reportId = $1
        RETURNING *;
      `;

      const result = await this.pool.query(query, [reportId, reason || null]);

      if (result.rows.length === 0) {
        logger.warn('DATABASE', 'Report not found for archival', { reportId });
        return null;
      }

      logger.success('DATABASE', 'Report archived', { reportId, reason });

      // Log the archival
      await this.logAudit(
        reportId,
        'isArchived',
        'false',
        'true',
        'user_archive',
        'api'
      );

      return result.rows[0];

    } catch (error) {
      logger.error('DATABASE', 'Failed to archive report', {
        error: error.message,
        reportId
      });
      throw error;
    }
  }

  /**
   * Unarchive a report (restore archived report)
   * @param {string} reportId - Report ID to unarchive
   * @returns {Promise<object>} Unarchived submission
   */
  async unarchiveReport(reportId) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not initialized');
      }

      logger.info('DATABASE', 'Unarchiving report', { reportId });

      const query = `
        UPDATE submissions
        SET isArchived = FALSE,
            archivedAt = NULL,
            archivedReason = NULL,
            updatedAt = CURRENT_TIMESTAMP
        WHERE reportId = $1
        RETURNING *;
      `;

      const result = await this.pool.query(query, [reportId]);

      if (result.rows.length === 0) {
        logger.warn('DATABASE', 'Report not found for unarchival', { reportId });
        return null;
      }

      logger.success('DATABASE', 'Report unarchived', { reportId });

      // Log the unarchival
      await this.logAudit(
        reportId,
        'isArchived',
        'true',
        'false',
        'user_unarchive',
        'api'
      );

      return result.rows[0];

    } catch (error) {
      logger.error('DATABASE', 'Failed to unarchive report', {
        error: error.message,
        reportId
      });
      throw error;
    }
  }

  /**
   * Grant access to a report for another user
   * @param {object} accessData - {reportId, reporterId, viewerId, expiresAt, txHash}
   * @returns {Promise<object>} Access record
   */
  async grantAccess(accessData) {
    try {
      const { reportId, reporterId, viewerId, expiresAt, txHash } = accessData;

      const result = await this.query(
        `INSERT INTO report_access (reportid, reporterid, viewerid, expiresat, isactive)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id, reportid, viewerid, grantedat, expiresat, isactive`,
        [reportId, reporterId, viewerId, expiresAt]
      );

      logger.success('DATABASE', 'Access granted', {
        reportId,
        viewerId,
        txHash
      });

      return result.rows[0];
    } catch (error) {
      logger.error('DATABASE', 'Failed to grant access', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Revoke access to a report
   * @param {string} reportId - Report ID
   * @param {string} viewerId - User ID to revoke from
   * @param {string} txHash - Transaction hash
   * @returns {Promise<object>} Updated access record
   */
  async revokeAccess(reportId, viewerId, txHash) {
    try {
      const result = await this.query(
        `UPDATE report_access
         SET isactive = FALSE, revokedat = CURRENT_TIMESTAMP
         WHERE reportid = $1 AND viewerid = $2 AND isactive = TRUE
         RETURNING id, reportid, viewerid, revokedat, isactive`,
        [reportId, viewerId]
      );

      if (result.rows.length === 0) {
        throw new Error('Access record not found or already revoked');
      }

      logger.success('DATABASE', 'Access revoked', {
        reportId,
        viewerId,
        txHash
      });

      return result.rows[0];
    } catch (error) {
      logger.error('DATABASE', 'Failed to revoke access', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all reports shared with a specific user
   * @param {string} viewerId - User ID
   * @returns {Promise<array>} Array of shared reports
   */
  async getSharedReports(viewerId) {
    try {
      const result = await this.query(
        `SELECT ra.reportid, ra.reporterid, ra.grantedat, ra.expiresat, ra.isactive, u.phone, u.email
         FROM report_access ra
         JOIN users u ON ra.reporterid = u.userid
         WHERE ra.viewerid = $1 AND ra.isactive = TRUE AND (ra.expiresat IS NULL OR ra.expiresat > NOW())
         ORDER BY ra.grantedat DESC`,
        [viewerId]
      );

      logger.success('DATABASE', 'Retrieved shared reports', {
        viewerId,
        count: result.rows.length
      });

      return result.rows;
    } catch (error) {
      logger.error('DATABASE', 'Failed to get shared reports', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all users who have access to a specific report
   * @param {string} reportId - Report ID
   * @param {string} reporterId - Reporter's user ID (for verification)
   * @returns {Promise<array>} Array of viewers
   */
  async getReportViewers(reportId, reporterId) {
    try {
      const result = await this.query(
        `SELECT ra.viewerid, ra.grantedat, ra.expiresat, ra.isactive, u.phone, u.email
         FROM report_access ra
         JOIN users u ON ra.viewerid = u.userid
         WHERE ra.reportid = $1 AND ra.reporterid = $2 AND ra.isactive = TRUE
         ORDER BY ra.grantedat DESC`,
        [reportId, reporterId]
      );

      logger.success('DATABASE', 'Retrieved report viewers', {
        reportId,
        count: result.rows.length
      });

      return result.rows;
    } catch (error) {
      logger.error('DATABASE', 'Failed to get report viewers', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all reports owned by a user that have been shared with others
   * @param {string} reporterId - Reporter's user ID
   * @returns {Promise<array>} Array of reports with access info
   */
  async getMySharedReports(reporterId) {
    try {
      const result = await this.query(
        `SELECT
           s.reportid,
           s.createdat,
           s.status,
           COUNT(CASE WHEN ra.isactive = TRUE THEN 1 END) AS viewercount
         FROM submissions s
         LEFT JOIN report_access ra ON s.reportid = ra.reportid
         WHERE s.userid = $1
         GROUP BY s.reportid, s.createdat, s.status
         HAVING COUNT(CASE WHEN ra.isactive = TRUE THEN 1 END) > 0
         ORDER BY s.createdat DESC`,
        [reporterId]
      );

      if (!result.rows || result.rows.length === 0) {
        logger.success('DATABASE', 'User has no shared reports', { reporterId });
        return [];
      }

      // For each report, get detailed viewer info
      const reportsWithViewers = [];
      for (const report of result.rows) {
        const viewersResult = await this.query(
          `SELECT ra.viewerid, ra.grantedat, ra.expiresat, ra.isactive, u.phone, u.email
           FROM report_access ra
           JOIN users u ON ra.viewerid = u.userid
           WHERE ra.reportid = $1 AND ra.reporterid = $2
           ORDER BY ra.grantedat DESC`,
          [report.reportid, reporterId]
        );

        reportsWithViewers.push({
          reportId: report.reportid,
          createdAt: report.createdat,
          status: report.status,
          viewerCount: parseInt(report.viewercount),
          viewers: viewersResult.rows || []
        });
      }

      logger.success('DATABASE', 'Retrieved user\'s shared reports', {
        reporterId,
        reportCount: reportsWithViewers.length
      });

      return reportsWithViewers;
    } catch (error) {
      logger.error('DATABASE', 'Failed to get user\'s shared reports', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if a user has access to a report
   * @param {string} reportId - Report ID
   * @param {string} viewerId - User ID
   * @returns {Promise<object|null>} Access record or null if no access
   */
  async checkAccess(reportId, viewerId) {
    try {
      const result = await this.query(
        `SELECT id, reportId, viewerId, grantedAt, expiresAt, isActive
         FROM report_access
         WHERE reportId = $1 AND viewerId = $2
         LIMIT 1`,
        [reportId, viewerId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('DATABASE', 'Failed to check access', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get submission with decrypted payload
   * @param {string} reportId - Report ID
   * @param {object} encryptionService - Encryption service for decryption
   * @returns {Promise<object>} Submission with decrypted payload
   */
  async getSubmissionDecrypted(reportId, encryptionService) {
    try {
      const result = await this.query(
        `SELECT * FROM submissions WHERE reportId = $1`,
        [reportId]
      );

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      const submission = result.rows[0];

      // Decrypt the encryption key with master key
      if (submission.encryptionkey && submission.encryptionkeyiv && submission.encryptionkeyauthtag) {
        const reportKey = encryptionService.decryptKey(
          submission.encryptionkey,
          submission.encryptionkeyiv,
          submission.encryptionkeyauthtag,
          reportId
        );

        // Note: The actual payload decryption happens when fetching from IPFS
        // We just provide the key here for the controller to use
        submission.reportKey = reportKey;
      }

      return submission;
    } catch (error) {
      logger.error('DATABASE', 'Failed to get decrypted submission', {
        error: error.message,
        reportId
      });
      throw error;
    }
  }

  /**
   * Save panic alert
   * @param {object} alertData - {userId, walletAddress, locationData, txHash, blockNumber}
   * @returns {Promise<object>} Panic alert record
   */
  async savePanicAlert(alertData) {
    try {
      const { userId, walletAddress, locationData, txHash, blockNumber } = alertData;

      const result = await this.query(
        `INSERT INTO panic_alerts (userId, walletAddress, locationData, txHash, blockNumber)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, userId, locationData, txHash, blockNumber, createdAt`,
        [userId, walletAddress, locationData, txHash, blockNumber]
      );

      logger.success('DATABASE', 'Panic alert saved', {
        userId,
        alertId: result.rows[0].id
      });

      return result.rows[0];
    } catch (error) {
      logger.error('DATABASE', 'Failed to save panic alert', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update panic alert with blockchain info
   * Called after blockchain confirmation to update txHash and blockNumber
   */
  async updatePanicAlert(alertId, updateData) {
    try {
      const { txHash, blockNumber, status } = updateData;

      const result = await this.query(
        `UPDATE panic_alerts
         SET txHash = $1, blockNumber = $2
         WHERE id = $3
         RETURNING id, txHash, blockNumber, createdAt`,
        [txHash, blockNumber, alertId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error(`Panic alert ${alertId} not found`);
      }

      logger.success('DATABASE', 'Panic alert updated with blockchain info', {
        alertId,
        txHash
      });

      return result.rows[0];
    } catch (error) {
      logger.error('DATABASE', 'Failed to update panic alert', {
        alertId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create panic audit log entry
   * For tracking all panic alert actions: created, SMS sent, blockchain confirmed, etc.
   */
  async createPanicAuditLog(data) {
    try {
      const { alertId, userId, action, contactPhone, smsStatus, failureReason, metadata } = data;

      const result = await this.query(
        `INSERT INTO panic_audit_log (alertId, userId, action, contactPhone, smsStatus, failureReason, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, alertId, action, createdAt`,
        [alertId, userId, action, contactPhone || null, smsStatus || null, failureReason || null, metadata || null]
      );

      logger.success('DATABASE', 'Panic audit log created', {
        alertId,
        action,
        userId
      });

      return result.rows[0];
    } catch (error) {
      logger.error('DATABASE', 'Failed to create panic audit log', {
        alertId,
        action,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get panic audit log for an alert
   */
  async getPanicAuditLog(alertId) {
    try {
      const result = await this.query(
        `SELECT id, alertId, userId, action, contactPhone, smsStatus, failureReason, createdAt
         FROM panic_audit_log
         WHERE alertId = $1
         ORDER BY createdAt DESC`,
        [alertId]
      );

      return result.rows || [];
    } catch (error) {
      logger.error('DATABASE', 'Failed to get panic audit log', {
        alertId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get panic alert history for a user
   * @param {string} userId - User ID
   * @param {number} limit - Results limit
   * @param {number} offset - Results offset
   * @returns {Promise<array>} Panic alert records
   */
  async getPanicAlerts(userId, limit = 10, offset = 0) {
    try {
      const result = await this.query(
        `SELECT id, locationData, txHash, blockNumber, createdAt
         FROM panic_alerts
         WHERE userId = $1
         ORDER BY createdAt DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return result.rows || [];
    } catch (error) {
      logger.error('DATABASE', 'Failed to get panic alerts', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Save key backup for recovery
   * @param {object} backupData - {userId, encryptedKey, keyIv, keyAuthTag, pinHash}
   * @returns {Promise<object>} Key backup record
   */
  async saveKeyBackup(backupData) {
    try {
      const { userId, encryptedKey, keyIv, keyAuthTag, pinHash } = backupData;

      const result = await this.query(
        `INSERT INTO key_backups (userId, encryptedKey, keyIv, keyAuthTag, pinHash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (userId) DO UPDATE SET
           encryptedKey = $2,
           keyIv = $3,
           keyAuthTag = $4,
           pinHash = $5,
           backupCreatedAt = CURRENT_TIMESTAMP
         RETURNING id, userId, backupCreatedAt`,
        [userId, encryptedKey, keyIv, keyAuthTag, pinHash]
      );

      logger.success('DATABASE', 'Key backup saved', { userId });

      return result.rows[0];
    } catch (error) {
      logger.error('DATABASE', 'Failed to save key backup', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get key backup by user ID
   * @param {string} userId - User ID
   * @returns {Promise<object|null>} Key backup record or null
   */
  async getKeyBackup(userId) {
    try {
      const result = await this.query(
        `SELECT id, encryptedKey, keyIv, keyAuthTag, pinHash, backupCreatedAt, recoveryAttempts
         FROM key_backups
         WHERE userId = $1`,
        [userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('DATABASE', 'Failed to get key backup', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update key backup recovery attempt counter
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async incrementRecoveryAttempts(userId) {
    try {
      await this.query(
        `UPDATE key_backups
         SET recoveryAttempts = recoveryAttempts + 1,
             lastRecoveryAttempt = CURRENT_TIMESTAMP
         WHERE userId = $1`,
        [userId]
      );

      logger.debug('DATABASE', 'Recovery attempt recorded', { userId });
    } catch (error) {
      logger.error('DATABASE', 'Failed to update recovery attempts', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Search and filter reports
   * @param {object} filters - {userId, status, createdAfter, createdBefore, limit, offset}
   * @returns {Promise<object>} {reports: [], total: number}
   */
  async searchReports(filters) {
    try {
      const { userId, status, createdAfter, createdBefore, limit = 10, offset = 0 } = filters;

      let query = `
        SELECT reportid, status, createdat, confirmedat, txhash, ipfshash
        FROM submissions
        WHERE userid = $1
      `;
      const params = [userId];

      if (status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(status);
      }

      if (createdAfter) {
        query += ` AND createdat >= $${params.length + 1}`;
        params.push(createdAfter);
      }

      if (createdBefore) {
        query += ` AND createdat <= $${params.length + 1}`;
        params.push(createdBefore);
      }

      // Count total
      const countResult = await this.query(`SELECT COUNT(*) FROM (${query}) as filtered`, params);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated results
      query += ` ORDER BY createdat DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await this.query(query, params);

      return {
        reports: result.rows.map(r => ({
          reportId: r.reportid,
          status: r.status,
          createdAt: r.createdat,
          confirmedAt: r.confirmedat,
          txHash: r.txhash,
          ipfsHash: r.ipfshash
        })) || [],
        total
      };
    } catch (error) {
      logger.error('DATABASE', 'Search failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get report statistics for user
   * @param {string} userId - User ID
   * @returns {Promise<object>} Stats
   */
  async getReportStats(userId) {
    try {
      const result = await this.query(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN isarchived = TRUE THEN 1 ELSE 0 END) as archived
         FROM submissions WHERE userid = $1`,
        [userId]
      );

      const row = result.rows[0];
      const sharedResult = await this.query(
        `SELECT COUNT(*) FROM report_access WHERE viewerid = $1 AND isactive = TRUE`,
        [userId]
      );

      return {
        total: parseInt(row.total) || 0,
        pending: parseInt(row.pending) || 0,
        confirmed: parseInt(row.confirmed) || 0,
        failed: parseInt(row.failed) || 0,
        archived: parseInt(row.archived) || 0,
        sharedWithMe: parseInt(sharedResult.rows[0].count) || 0
      };
    } catch (error) {
      logger.error('DATABASE', 'Get stats failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get notifications for user
   * @param {object} filters - {userId, isRead, type, limit, offset}
   * @returns {Promise<object>} {notifications: [], total: number, unreadCount: number}
   */
  async getNotifications(filters) {
    try {
      const { userId, isRead, type, limit = 20, offset = 0 } = filters;

      let query = 'SELECT * FROM notifications WHERE userid = $1';
      const params = [userId];
      let paramCount = 2;

      if (isRead !== undefined) {
        query += ` AND isread = $${paramCount}`;
        params.push(isRead);
        paramCount++;
      }

      if (type) {
        query += ` AND type = $${paramCount}`;
        params.push(type);
        paramCount++;
      }

      const countResult = await this.query(
        `SELECT COUNT(*) FROM notifications WHERE userid = $1${isRead !== undefined ? ' AND isread = $2' : ''}${type ? ` AND type = $${isRead !== undefined ? 3 : 2}` : ''}`,
        isRead !== undefined && type ? [userId, isRead, type] : isRead !== undefined ? [userId, isRead] : type ? [userId, type] : [userId]
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await this.query(
        `${query} ORDER BY createdat DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
        [...params, limit, offset]
      );

      const unreadResult = await this.query(
        'SELECT COUNT(*) FROM notifications WHERE userid = $1 AND isread = FALSE',
        [userId]
      );

      return {
        notifications: result.rows || [],
        total,
        unreadCount: parseInt(unreadResult.rows[0].count)
      };
    } catch (error) {
      logger.error('DATABASE', 'Get notifications failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a notification
   * @param {object} data - {userId, type, title, message, relatedId}
   * @returns {Promise<object>} Notification record
   */
  async createNotification(data) {
    try {
      const { userId, type, title, message, relatedId } = data;

      const result = await this.query(
        `INSERT INTO notifications (userid, type, title, message, relatedid)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [userId, type, title, message, relatedId || null]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('DATABASE', 'Create notification failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Mark notification as read
   * @param {string} notificationId - Notification ID
   * @param {string} userId - User ID
   * @returns {Promise<object|null>} Updated notification or null
   */
  async markNotificationAsRead(notificationId, userId) {
    try {
      const result = await this.query(
        `UPDATE notifications SET isread = TRUE, readat = CURRENT_TIMESTAMP
         WHERE id = $1 AND userid = $2 RETURNING *`,
        [notificationId, userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('DATABASE', 'Mark as read failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   * @param {string} userId - User ID
   * @returns {Promise<object>} {count: number}
   */
  async markAllNotificationsAsRead(userId) {
    try {
      const result = await this.query(
        `UPDATE notifications SET isread = TRUE, readat = CURRENT_TIMESTAMP
         WHERE userid = $1 AND isread = FALSE RETURNING id`,
        [userId]
      );

      return { count: result.rows.length };
    } catch (error) {
      logger.error('DATABASE', 'Mark all as read failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete a notification
   * @param {string} notificationId - Notification ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteNotification(notificationId, userId) {
    try {
      const result = await this.query(
        `DELETE FROM notifications WHERE id = $1 AND userid = $2 RETURNING id`,
        [notificationId, userId]
      );

      return result.rows.length > 0;
    } catch (error) {
      logger.error('DATABASE', 'Delete notification failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get unread notification count
   * @param {string} userId - User ID
   * @returns {Promise<number>} Unread count
   */
  async getUnreadNotificationCount(userId) {
    try {
      const result = await this.query(
        'SELECT COUNT(*) FROM notifications WHERE userid = $1 AND isread = FALSE',
        [userId]
      );

      return parseInt(result.rows[0].count) || 0;
    } catch (error) {
      logger.error('DATABASE', 'Get unread count failed', { error: error.message });
      return 0;
    }
  }

  /**
   * Execute arbitrary SQL query
   * Used for authentication and other operations
   * @param {string} query - SQL query string
   * @param {array} params - Query parameters (for parameterized queries)
   * @returns {Promise<object>} Query result object
   */
  async query(sql, params = []) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not initialized');
      }

      const result = await this.pool.query(sql, params);
      return result;
    } catch (error) {
      logger.error('DATABASE', 'Query execution failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    try {
      if (this.pool) {
        await this.pool.end();
        this.isConnected = false;
        logger.success('DATABASE', 'Connection closed');
      }
    } catch (error) {
      logger.error('DATABASE', 'Error closing connection', {
        error: error.message
      });
    }
  }
}

// Export singleton instance
module.exports = new DatabaseService();
