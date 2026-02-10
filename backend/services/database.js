/**
 * Database Service
 * Handles all PostgreSQL queries for submissions
 * Includes encryption/decryption of sensitive data
 */

const logger = require('../utils/logger');
const crypto = require('crypto');

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
        metadata = null,
        userId = null // Extract userId for encryption
      } = submission;

      logger.info('DATABASE', 'Saving submission', { reportId });

      // ========== ENCRYPT SENSITIVE DATA ==========
      // Encrypt responses and metadata using userId-based key
      const encryptedResponses = this.encrypt(responses, userId || reportId);
      const encryptedMetadata = this.encrypt(metadata, userId || reportId);

      logger.debug('DATABASE', 'Sensitive data encrypted before storage', { reportId });

      const query = `
        INSERT INTO submissions (
          reportId, txHash, ipfsHash, responses,
          blockNumber, gasUsed, status, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
      `;

      const result = await this.pool.query(query, [
        reportId,
        txHash,
        ipfsHash,
        encryptedResponses, // Encrypted before storing
        blockNumber,
        gasUsed,
        'pending', // Initial status
        encryptedMetadata ? JSON.stringify(encryptedMetadata) : null
      ]);

      logger.success('DATABASE', 'Submission saved (encrypted)', { reportId });
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
   * Get submission by reportId
   * @param {string} reportId - Report ID
   * @param {string} userId - User ID for decryption (optional, defaults to reportId)
   * @returns {Promise<object>} Submission record with decrypted data or null
   */
  async getSubmission(reportId, userId = null) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not initialized');
      }

      logger.debug('DATABASE', 'Fetching submission', { reportId });

      const query = 'SELECT * FROM submissions WHERE reportId = $1;';
      const result = await this.pool.query(query, [reportId]);

      if (result.rows.length === 0) {
        logger.warn('DATABASE', 'Submission not found', { reportId });
        return null;
      }

      let submission = result.rows[0];

      // ========== DECRYPT SENSITIVE DATA ==========
      // Decrypt responses and metadata using userId-based key
      const decryptionUserId = userId || reportId;

      if (submission.responses) {
        submission.responses = this.decrypt(submission.responses, decryptionUserId);
      }

      if (submission.metadata) {
        submission.metadata = this.decrypt(submission.metadata, decryptionUserId);
      }

      logger.success('DATABASE', 'Submission retrieved (decrypted)', { reportId });
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
