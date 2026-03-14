/**
 * Blockchain Service
 * Handles smart contract interactions
 */

const contractManager = require('../config/contracts');
const { ethers } = require('ethers');
const logger = require('../utils/logger');

class BlockchainService {
  /**
   * Submit a report to the smart contract
   * @param {string} ipfsHash - IPFS CID of encrypted report
   * @param {string[]} responses - Array of responses to 5 questions
   * @param {string|number} userId - Authenticated app user ID (hashed before on-chain use)
   * @returns {Promise<object>} Transaction details
   */
  async submitReport(ipfsHash, responses, userId) {
    try {
      const userKey = this.getUserKey(userId);

      console.log('\n⛓️  BLOCKCHAIN.submitReport() called');
      console.log('   userId:', userId);
      console.log('   userKey (hash):', userKey);
      console.log('   ipfsHash:', ipfsHash);

      logger.logBlockchain('Submit Report', 'pending', {
        ipfsHash,
        responseCount: responses ? responses.length : 0,
        userKey
      });

      // Validate inputs
      if (!ipfsHash || typeof ipfsHash !== 'string') {
        throw new Error('Invalid IPFS hash');
      }

      // If responses not provided or incomplete, pad with empty strings
      let finalResponses = responses || [];
      if (!Array.isArray(finalResponses)) {
        finalResponses = [];
      }

      // Pad to exactly 5 responses (for reports without survey answers)
      while (finalResponses.length < 5) {
        finalResponses.push('');
      }

      // Trim to 5 if more than 5
      if (finalResponses.length > 5) {
        finalResponses = finalResponses.slice(0, 5);
      }

      // Get contract instance
      const contract = contractManager.getContract();

      console.log('📞 Calling contract.submitReportFor()');
      // Company wallet writes per-user records using a pseudonymous user key
      const tx = await contract.submitReportFor(userKey, ipfsHash, finalResponses);

      console.log('💾 Transaction sent, waiting for confirmation...');
      console.log('   txHash:', tx.hash);

      logger.info('BLOCKCHAIN', 'Transaction sent', {
        txHash: tx.hash,
        ipfsHash
      });

      // Wait for confirmation (1 block)
      const receipt = await tx.wait(1);

      console.log('✅ Transaction confirmed:');
      console.log('   txHash:', receipt.hash);
      console.log('   blockNumber:', receipt.blockNumber);
      console.log('   gasUsed:', receipt.gasUsed.toString());
      console.log('   from:', receipt.from);

      logger.logBlockchain('Submit Report', 'success', {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        userKey
      });

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        from: receipt.from,
        userKey
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
  /**
   * Get report status by querying contract state (not transaction history)
   * This is more reliable than getTransactionStatus as it persists across blockchain resets
   * @param {string|number} userId - App user ID used to derive report key
   * @returns {Promise<object>} Report status
   */
  async getReportStatusFromContract(userId) {
    try {
      const userKey = this.getUserKey(userId);

      console.log('\n⛓️  BLOCKCHAIN.getReportStatusFromContract() called');
      console.log('   userId:', userId);
      console.log('   userKey (hash):', userKey);

      logger.info('BLOCKCHAIN', 'Checking report status from contract', { userKey });

      const contract = contractManager.getContract();

      console.log('📞 Querying contract.getReportStatusFor()');
      // Query delegated storage keyed by user ID hash.
      const [exists, timestamp, ipfsHash, version] = await contract.getReportStatusFor(userKey);

      console.log('   exists:', exists);
      console.log('   timestamp:', timestamp.toString());
      console.log('   ipfsHash:', ipfsHash);
      console.log('   version:', version.toString());

      if (!exists) {
        console.log('❌ Report does not exist in contract');
        logger.info('BLOCKCHAIN', 'Report does not exist in contract', { userKey });
        return {
          status: 'not_found',
          exists: false,
          userKey
        };
      }

      console.log('✅ Report found in contract, status: confirmed');

      // Convert BigInt to string to avoid serialization errors
      const timestampStr = timestamp.toString();
      const versionStr = version.toString();

      logger.success('BLOCKCHAIN', 'Report status retrieved from contract', {
        status: 'confirmed',
        timestamp: timestampStr,
        version: versionStr
      });

      return {
        status: 'confirmed',  // ✅ If it exists in contract, it's confirmed
        exists: true,
        timestamp: timestampStr,
        ipfsHash,
        version: versionStr,
        userKey
      };
    } catch (error) {
      logger.error('BLOCKCHAIN', 'Failed to get report status from contract', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get transaction status (legacy - kept for backward compatibility)
   * DEPRECATED: Use getReportStatusFromContract instead
   * This fails if blockchain resets
   */
  async getTransactionStatus(txHash) {
    try {
      logger.info('BLOCKCHAIN', 'Checking transaction status', { txHash });

      const provider = contractManager.getProvider();
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!receipt) {
        logger.info('BLOCKCHAIN', 'Transaction pending or not found (blockchain may have reset)', { txHash });
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
   * @param {string|number} userId - App user ID
   * @returns {Promise<string>} Estimated gas
   */
  async estimateGas(ipfsHash, responses, userId) {
    try {
      const userKey = this.getUserKey(userId);
      const contract = contractManager.getContract();
      const gasEstimate = await contract.submitReportFor.estimateGas(
        userKey,
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
   * Derive a stable pseudonymous key for app users.
   * Using hash avoids placing raw user IDs on-chain.
   */
  getUserKey(userId) {
    if (userId === undefined || userId === null || userId === '') {
      throw new Error('Invalid userId for blockchain report mapping');
    }

    return ethers.id(String(userId));
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
