/**
 * Database Service
 * Handles all PostgreSQL queries for submissions
 */

const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.pool = null;
    this.isConnected = false;
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
   * @param {object} submission - { reportId, txHash, ipfsHash, responses, blockNumber, gasUsed }
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
        metadata = null
      } = submission;

      logger.info('DATABASE', 'Saving submission', { reportId });

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
        responses, // PostgreSQL array type
        blockNumber,
        gasUsed,
        'pending', // Initial status
        metadata ? JSON.stringify(metadata) : null
      ]);

      logger.success('DATABASE', 'Submission saved', { reportId });
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
   * @returns {Promise<object>} Submission record or null
   */
  async getSubmission(reportId) {
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

      logger.success('DATABASE', 'Submission retrieved', { reportId });
      return result.rows[0];

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
   * @param {object} filters - { status, limit, offset }
   * @returns {Promise<array>} Array of submissions
   */
  async getSubmissions(filters = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not initialized');
      }

      const { status = null, limit = 50, offset = 0 } = filters;

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

      logger.success('DATABASE', 'Submissions retrieved', {
        count: result.rows.length,
        status
      });

      return result.rows;

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
