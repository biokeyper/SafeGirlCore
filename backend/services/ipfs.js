/**
 * IPFS Service
 * Handles uploading encrypted reports to IPFS using Web3.Storage
 */

const { Web3Storage } = require('web3.storage');
const logger = require('../utils/logger');

class IPFSService {
  constructor() {
    this.token = process.env.WEB3_STORAGE_TOKEN;
    this.client = null;
    this.isInitialized = false;
  }

  /**
   * Initialize Web3.Storage client
   */
  async initialize() {
    try {
      if (!this.token) {
        throw new Error('WEB3_STORAGE_TOKEN not set in .env');
      }

      this.client = new Web3Storage({ token: this.token });
      this.isInitialized = true;

      logger.success('IPFS', 'Web3.Storage client initialized');
      return true;
    } catch (error) {
      logger.error('IPFS', 'Failed to initialize Web3.Storage', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Upload encrypted report to IPFS
   * @param {Buffer} encryptedData - Encrypted report payload
   * @param {string} filename - Name of file (e.g., "report_user_123.bin")
   * @returns {Promise<string>} IPFS CID (hash)
   */
  async uploadToIPFS(encryptedData, filename = 'encrypted_report.bin') {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!encryptedData || encryptedData.length === 0) {
        throw new Error('Empty encrypted data');
      }

      logger.info('IPFS', 'Starting upload', {
        filename,
        size: encryptedData.length
      });

      // Create a File object for Web3.Storage
      const file = new File([encryptedData], filename, {
        type: 'application/octet-stream'
      });

      // Upload to IPFS
      const cid = await this.client.put([file], {
        onRootCidReady: (cid) => {
          logger.debug('IPFS', 'Root CID generated', { cid: cid.toString() });
        },
        onStoredChunk: (bytes) => {
          logger.debug('IPFS', 'Chunk stored', { bytes });
        }
      });

      logger.logIPFS('Upload', 'success', {
        cid: cid.toString(),
        filename,
        size: encryptedData.length
      });

      return cid.toString();
    } catch (error) {
      logger.logIPFS('Upload', 'error', {
        filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Retrieve file from IPFS
   * @param {string} cid - IPFS Content Identifier (hash)
   * @returns {Promise<Buffer>} File content
   */
  async retrieveFromIPFS(cid) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!cid || typeof cid !== 'string') {
        throw new Error('Invalid CID');
      }

      logger.info('IPFS', 'Starting retrieval', { cid });

      // Retrieve file from IPFS
      const response = await fetch(`https://${cid}.ipfs.w3s.link/`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const data = Buffer.from(buffer);

      logger.logIPFS('Retrieval', 'success', {
        cid,
        size: data.length
      });

      return data;
    } catch (error) {
      logger.logIPFS('Retrieval', 'error', {
        cid,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verify file exists on IPFS
   * @param {string} cid - IPFS CID
   * @returns {Promise<boolean>} File exists
   */
  async verifyFileExists(cid) {
    try {
      logger.info('IPFS', 'Verifying file', { cid });

      const response = await fetch(`https://${cid}.ipfs.w3s.link/`, {
        method: 'HEAD'
      });

      const exists = response.ok;

      if (exists) {
        logger.success('IPFS', 'File verified', { cid });
      } else {
        logger.warn('IPFS', 'File not found', { cid, status: response.status });
      }

      return exists;
    } catch (error) {
      logger.warn('IPFS', 'Verification failed', {
        cid,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get IPFS gateway URL for a CID
   * @param {string} cid - IPFS CID
   * @returns {string} Full gateway URL
   */
  getGatewayURL(cid) {
    return `https://${cid}.ipfs.w3s.link/`;
  }

  /**
   * Get file size from IPFS
   * @param {string} cid - IPFS CID
   * @returns {Promise<number|null>} File size in bytes or null if error
   */
  async getFileSize(cid) {
    try {
      const response = await fetch(`https://${cid}.ipfs.w3s.link/`, {
        method: 'HEAD'
      });

      if (!response.ok) {
        return null;
      }

      const size = response.headers.get('content-length');
      return size ? parseInt(size) : null;
    } catch (error) {
      logger.warn('IPFS', 'Failed to get file size', {
        cid,
        error: error.message
      });
      return null;
    }
  }
}

// Export singleton instance
module.exports = new IPFSService();
