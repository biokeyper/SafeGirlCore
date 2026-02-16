/**
 * Blockchain Service
 * Handles smart contract interactions
 */

const contractManager = require('../config/contracts');
const logger = require('../utils/logger');

class BlockchainService {
  /**
   * Submit a report to the smart contract
   * @param {string} ipfsHash - IPFS CID of encrypted report
   * @param {string[]} responses - Array of responses to 5 questions
   * @returns {Promise<object>} Transaction details
   */
  async submitReport(ipfsHash, responses) {
    try {
      logger.logBlockchain('Submit Report', 'pending', {
        ipfsHash,
        responseCount: responses.length
      });

      // Validate inputs
      if (!ipfsHash || typeof ipfsHash !== 'string') {
        throw new Error('Invalid IPFS hash');
      }

      if (!Array.isArray(responses) || responses.length !== 5) {
        throw new Error('Must provide exactly 5 responses');
      }

      // Get contract instance
      const contract = contractManager.getContract();

      // Call submitReport function
      const tx = await contract.submitReport(ipfsHash, responses);

      logger.info('BLOCKCHAIN', 'Transaction sent', {
        txHash: tx.hash,
        ipfsHash
      });

      // Wait for confirmation (1 block)
      const receipt = await tx.wait(1);

      logger.logBlockchain('Submit Report', 'success', {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      });

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        from: receipt.from
      };
    } catch (error) {
      logger.logBlockchain('Submit Report', 'error', {
        error: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * Grant access to a viewer
   * @param {string} viewerAddress - Viewer's wallet address
   * @param {number} customExpiry - Custom expiry in seconds (0 for default)
   * @returns {Promise<object>} Transaction details
   */
  async grantAccess(viewerAddress, customExpiry = 0) {
    try {
      logger.logBlockchain('Grant Access', 'pending', {
        viewer: viewerAddress,
        customExpiry
      });

      const contract = contractManager.getContract();
      const tx = await contract.grantAccess(viewerAddress, customExpiry);

      logger.info('BLOCKCHAIN', 'Grant access transaction sent', {
        txHash: tx.hash
      });

      const receipt = await tx.wait(1);

      logger.logBlockchain('Grant Access', 'success', {
        txHash: receipt.hash,
        viewer: viewerAddress
      });

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      logger.logBlockchain('Grant Access', 'error', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Revoke access from a viewer
   * @param {string} viewerAddress - Viewer's wallet address
   * @returns {Promise<object>} Transaction details
   */
  async revokeAccess(viewerAddress) {
    try {
      logger.logBlockchain('Revoke Access', 'pending', {
        viewer: viewerAddress
      });

      const contract = contractManager.getContract();
      const tx = await contract.revokeAccess(viewerAddress);

      logger.info('BLOCKCHAIN', 'Revoke access transaction sent', {
        txHash: tx.hash
      });

      const receipt = await tx.wait(1);

      logger.logBlockchain('Revoke Access', 'success', {
        txHash: receipt.hash,
        viewer: viewerAddress
      });

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      logger.logBlockchain('Revoke Access', 'error', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get active consents for a reporter
   * @param {string} reporterAddress - Reporter's address
   * @returns {Promise<array>} Array of active consents
   */
  async getActiveConsents(reporterAddress) {
    try {
      logger.info('BLOCKCHAIN', 'Fetching active consents', {
        reporter: reporterAddress
      });

      const contract = contractManager.getContract();
      const consents = await contract.getActiveConsents(reporterAddress);

      logger.success('BLOCKCHAIN', 'Consents retrieved', {
        count: consents.length
      });

      return consents;
    } catch (error) {
      logger.error('BLOCKCHAIN', 'Failed to fetch consents', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get transaction receipt and details
   * @param {string} txHash - Transaction hash
   * @returns {Promise<object>} Transaction status
   */
  async getTransactionStatus(txHash) {
    try {
      logger.info('BLOCKCHAIN', 'Checking transaction status', { txHash });

      const provider = contractManager.getProvider();
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!receipt) {
        logger.info('BLOCKCHAIN', 'Transaction pending', { txHash });
        return {
          status: 'pending',
          txHash,
          confirmations: 0
        };
      }

      // Get current block number for confirmation count
      const currentBlock = await provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber;

      logger.success('BLOCKCHAIN', 'Transaction status retrieved', {
        status: receipt.status === 1 ? 'confirmed' : 'failed',
        confirmations
      });

      return {
        status: receipt.status === 1 ? 'confirmed' : 'failed',
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        confirmations,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error('BLOCKCHAIN', 'Failed to get transaction status', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Estimate gas for submitReport
   * @param {string} ipfsHash - IPFS hash
   * @param {string[]} responses - Responses
   * @returns {Promise<string>} Estimated gas
   */
  async estimateGas(ipfsHash, responses) {
    try {
      const contract = contractManager.getContract();
      const gasEstimate = await contract.submitReport.estimateGas(
        ipfsHash,
        responses
      );

      logger.debug('BLOCKCHAIN', 'Gas estimate', {
        estimatedGas: gasEstimate.toString()
      });

      return gasEstimate.toString();
    } catch (error) {
      logger.warn('BLOCKCHAIN', 'Gas estimation failed', {
        error: error.message
      });
      // Return a safe estimate if calculation fails
      return '150000';
    }
  }

  /**
   * Get backend wallet address
   * @returns {string} Signer address
   */
  getWalletAddress() {
    const signer = contractManager.getSigner();
    return signer.address;
  }

  /**
   * Get contract address
   * @returns {string} Contract address
   */
  getContractAddress() {
    return process.env.DEPLOYED_CONTRACT_ADDRESS;
  }

  /**
   * Send panic alert to blockchain
   * @param {string} locationData - User's location/emergency info
   * @returns {Promise<object>} Transaction details
   */
  async sendPanicAlert(locationData) {
    try {
      logger.logBlockchain('Send Panic Alert', 'pending', {
        locationLength: locationData.length
      });

      const contract = contractManager.getContract();
      const tx = await contract.sendPanicAlert(locationData);

      logger.info('BLOCKCHAIN', 'Panic alert transaction sent', {
        txHash: tx.hash
      });

      const receipt = await tx.wait(1);

      logger.logBlockchain('Send Panic Alert', 'success', {
        txHash: receipt.hash
      });

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      logger.logBlockchain('Send Panic Alert', 'error', {
        error: error.message
      });
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new BlockchainService();
