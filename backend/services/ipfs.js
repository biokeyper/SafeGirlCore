/**
 * IPFS Service
 * Handles uploading encrypted reports to IPFS using Pinata
 * Pinata: Reliable IPFS pinning service
 */

const FormData = require("form-data");
const axios = require("axios");
const logger = require("../utils/logger");

class IPFSService {
  constructor() {
    this.token = process.env.PINATA_JWT;
    this.apiUrl = "https://api.pinata.cloud/pinning";
    this.gatewayUrl = "https://gateway.pinata.cloud/ipfs";
    this.isInitialized = false;
  }

  /**
   * Initialize Pinata client
   */
  async initialize() {
    try {
      if (!this.token) {
        throw new Error("PINATA_JWT not set in .env");
      }

      // Pinata uses JWT Bearer token authentication
      this.isInitialized = true;
      logger.success("IPFS", "Pinata IPFS client initialized");
      return true;
    } catch (error) {
      logger.error("IPFS", "Failed to initialize Pinata", {
        error: error.message,
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
  async uploadToIPFS(encryptedData, filename = "encrypted_report.bin") {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!encryptedData || encryptedData.length === 0) {
        throw new Error("Empty encrypted data");
      }

      logger.info("IPFS", "Starting upload to Pinata", {
        filename,
        size: encryptedData.length,
        dataType: typeof encryptedData,
        isBuffer: Buffer.isBuffer(encryptedData),
      });

      // Create FormData with Buffer directly (not stream)
      const formData = new FormData();

      // Append the Buffer directly with filename (NO stream conversion)
      formData.append("file", encryptedData, {
        filename: filename,
        contentType: "application/octet-stream",
      });

      // Append pinata metadata (Pinata expects this)
      formData.append(
        "pinataMetadata",
        JSON.stringify({
          name: filename,
        }),
      );

      // Append pinata options (Pinata expects this)
      formData.append(
        "pinataOptions",
        JSON.stringify({
          cidVersion: 1,
        }),
      );

      // Get headers from form-data (Buffer allows proper Content-Length calculation)
      const formDataHeaders = formData.getHeaders();

      const headers = {
        Authorization: `Bearer ${this.token}`,
        ...formDataHeaders,
      };

      logger.debug("IPFS", "Pinata request details", {
        endpoint: `${this.apiUrl}/pinFileToIPFS`,
        hasAuth: !!headers["Authorization"],
        contentType: headers["content-type"]?.substring(0, 60),
      });

      // Upload to Pinata using Axios
      let response;
      try {
        response = await axios.post(`${this.apiUrl}/pinFileToIPFS`, formData, {
          maxBodyLength: "Infinity",
          maxContentLength: "Infinity",
          headers: {
            ...formData.getHeaders(), // This ensures proper boundary
            Authorization: `Bearer ${this.token}`,
          },
        });
      } catch (axiosError) {
        logger.error("IPFS", "Pinata request failed", {
          message: axiosError.message,
          status: axiosError.response?.status,
          error: axiosError.response?.data,
        });
        throw axiosError;
      }

      logger.debug("IPFS", "Pinata response", {
        status: response.status,
        statusText: response.statusText,
      });

      const result = response.data;
      const cid = result.IpfsHash;

      if (!cid) {
        logger.error("IPFS", "No IPFS hash in Pinata response", { result });
        throw new Error("Upload successful but no IPFS hash returned");
      }

      logger.success("IPFS", "Pinata upload successful", {
        cid: cid,
        filename: filename,
        size: encryptedData.length,
      });

      logger.logIPFS("Upload", "success", {
        cid,
        filename,
        size: encryptedData.length,
      });

      return cid;
    } catch (error) {
      logger.logIPFS("Upload", "error", {
        filename,
        error: error.message,
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

      if (!cid || typeof cid !== "string") {
        throw new Error("Invalid CID");
      }

      logger.info("IPFS", "Starting retrieval", { cid });

      // Retrieve file from IPFS via Pinata gateway
      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const data = Buffer.from(buffer);

      logger.logIPFS("Retrieval", "success", {
        cid,
        size: data.length,
      });

      return data;
    } catch (error) {
      logger.logIPFS("Retrieval", "error", {
        cid,
        error: error.message,
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
      logger.info("IPFS", "Verifying file", { cid });

      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, {
        method: "HEAD",
      });

      const exists = response.ok;

      if (exists) {
        logger.success("IPFS", "File verified", { cid });
      } else {
        logger.warn("IPFS", "File not found", { cid, status: response.status });
      }

      return exists;
    } catch (error) {
      logger.warn("IPFS", "Verification failed", {
        cid,
        error: error.message,
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
    return `${this.gatewayUrl}/${cid}`;
  }

  /**
   * Get file size from IPFS
   * @param {string} cid - IPFS CID
   * @returns {Promise<number|null>} File size in bytes or null if error
   */
  async getFileSize(cid) {
    try {
      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, {
        method: "HEAD",
      });

      if (!response.ok) {
        return null;
      }

      const size = response.headers.get("content-length");
      return size ? parseInt(size) : null;
    } catch (error) {
      logger.warn("IPFS", "Failed to get file size", {
        cid,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Download encrypted data from IPFS
   * @param {string} cid - Content Identifier (IPFS hash)
   * @returns {Promise<string>} Encrypted data as hex string
   */
  async downloadFromIPFS(cid) {
    try {
      if (!cid) {
        throw new Error("CID is required");
      }

      const url = `${this.gatewayUrl}/${cid}`;

      logger.info("IPFS", "Downloading from IPFS", { cid, url });

      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30000,
      });

      if (!response.data) {
        throw new Error("No data received from IPFS");
      }

      // Convert buffer to hex string for decryption
      const hexData = Buffer.from(response.data).toString("hex");

      logger.success("IPFS", "Downloaded from IPFS successfully", {
        cid,
        size: response.data.length,
      });

      return hexData;
    } catch (error) {
      logger.error("IPFS", "Failed to download from IPFS", {
        cid,
        error: error.message,
      });
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new IPFSService();
