/**
 * Event Listener Service
 * Listens to smart contract events for monitoring and logging
 */

const contractManager = require('../config/contracts');
const logger = require('../utils/logger');

class EventListener {
  constructor() {
    this.listeners = [];
    this.isListening = false;
  }

  /**
   * Start listening to contract events
   */
  async startListening() {
    try {
      const contract = contractManager.getContract();

      logger.logServer('Starting event listener...');

      // Add error handler to suppress benign Hardhat node filter errors
      contract.on('error', (error) => {
        // Silently ignore "filter not found" errors - these are benign on local Hardhat
        if (!error.message?.includes?.('filter not found') &&
            !error.message?.includes?.('could not coalesce error')) {
          logger.error('EVENT_LISTENER', 'Contract error', { error: error.message });
        }
      });

      // Listen to ReportSubmitted events
      contract.on('ReportSubmitted', (reporter, timestamp, ipfsHash, version) => {
        logger.success('EVENT', 'Report submitted', {
          reporter,
          timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
          ipfsHash,
          version: version.toString()
        });
      });

      // Listen to ReportUpdated events
      contract.on('ReportUpdated', (reporter, timestamp, newIpfsHash, version) => {
        logger.success('EVENT', 'Report updated', {
          reporter,
          timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
          newIpfsHash,
          version: version.toString()
        });
      });

      // Listen to ConsentGranted events
      contract.on('ConsentGranted', (reporter, viewer, expiresAt) => {
        logger.success('EVENT', 'Consent granted', {
          reporter,
          viewer,
          expiresAt: new Date(parseInt(expiresAt) * 1000).toISOString()
        });
      });

      // Listen to ConsentRevoked events
      contract.on('ConsentRevoked', (reporter, viewer) => {
        logger.warn('EVENT', 'Consent revoked', {
          reporter,
          viewer
        });
      });

      // Listen to PanicAlert events
      contract.on('PanicAlert', (sender, timestamp, locationData) => {
        logger.error('EVENT', 'PANIC ALERT', {
          sender,
          timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
          locationData
        });
      });

      this.isListening = true;
      logger.logServer('Event listener started successfully');
    } catch (error) {
      logger.error('EVENT_LISTENER', 'Failed to start listening', {
        error: error.message
      });
    }
  }

  /**
   * Stop listening to events
   */
  stopListening() {
    try {
      const contract = contractManager.getContract();
      contract.removeAllListeners();
      this.isListening = false;
      logger.logServer('Event listener stopped');
    } catch (error) {
      logger.error('EVENT_LISTENER', 'Error stopping listener', {
        error: error.message
      });
    }
  }

  /**
   * Listen to a specific event once
   */
  async once(eventName) {
    try {
      const contract = contractManager.getContract();
      const event = await contract.once(eventName);
      logger.debug('EVENT_LISTENER', `Listening for ${eventName}...`);
      return event;
    } catch (error) {
      logger.error('EVENT_LISTENER', `Error listening to ${eventName}`, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Is listener active
   */
  isActive() {
    return this.isListening;
  }
}

// Export singleton instance
module.exports = new EventListener();
