/**
 * Smart Contract Configuration
 * Contains ABI, address, and ethers.js setup
 */
// the bridge between  my node backend and the smart contract on the blockchain. it sets up the connection to the blockchain and tells ethers.js how to talk to my safegirl contracr
//its like the provider;connection to read blaockchain data 
//signer;my backend's wallet that pays for transactions
//contract ; the interface to call smart contract fucntions 
const { ethers } = require('ethers');
const logger = require('../utils/logger');

// Contract ABI (Application Binary Interface)
// This is the list of functions the smart contract has
const SAFEGIRL_ABI = [
  // submitReport(string ipfsHash, string[] responses)
  {
    inputs: [
      { name: '_ipfsHash', type: 'string' },
      { name: '_responses', type: 'string[]' }
    ],
    name: 'submitReport',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // updateReport(string newIpfsHash, string[] newResponses)
  {
    inputs: [
      { name: '_newIpfsHash', type: 'string' },
      { name: '_newResponses', type: 'string[]' }
    ],
    name: 'updateReport',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // grantAccess(address viewer, uint256 customExpiry)
  {
    inputs: [
      { name: '_viewer', type: 'address' },
      { name: '_customExpiry', type: 'uint256' }
    ],
    name: 'grantAccess',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // revokeAccess(address viewer)
  {
    inputs: [{ name: '_viewer', type: 'address' }],
    name: 'revokeAccess',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // getActiveConsents(address reporter)
  {
    inputs: [{ name: '_reporter', type: 'address' }],
    name: 'getActiveConsents',
    outputs: [
      {
        components: [
          { name: 'viewer', type: 'address' },
          { name: 'grantedAt', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'active', type: 'bool' }
        ],
        type: 'tuple[]'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'reporter', type: 'address' },
      { indexed: false, name: 'timestamp', type: 'uint256' },
      { indexed: false, name: 'ipfsHash', type: 'string' },
      { indexed: false, name: 'version', type: 'uint256' }
    ],
    name: 'ReportSubmitted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'reporter', type: 'address' },
      { indexed: false, name: 'timestamp', type: 'uint256' },
      { indexed: false, name: 'newIpfsHash', type: 'string' },
      { indexed: false, name: 'version', type: 'uint256' }
    ],
    name: 'ReportUpdated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'reporter', type: 'address' },
      { indexed: true, name: 'viewer', type: 'address' },
      { indexed: false, name: 'expiresAt', type: 'uint256' }
    ],
    name: 'ConsentGranted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'reporter', type: 'address' },
      { indexed: true, name: 'viewer', type: 'address' }
    ],
    name: 'ConsentRevoked',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: false, name: 'timestamp', type: 'uint256' },
      { indexed: false, name: 'locationData', type: 'string' }
    ],
    name: 'PanicAlert',
    type: 'event'
  }
];

class ContractManager { //class that manages the block chain connection
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contract = null;
    this.contractAddress = process.env.DEPLOYED_CONTRACT_ADDRESS;
    // Use Polygon Amoy (Mumbai is deprecated)
    this.rpcUrl = process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology/';
    this.privateKey = process.env.PRIVATE_KEY;
  }

  /**
   * Initialize provider and signer
   * Must be called before using contract methods
   */
  async initialize() {
    try {
      // Create provider (connection to blockchain)
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);

      // Verify RPC connection
      const network = await this.provider.getNetwork();
      logger.success('CONFIG', 'Connected to blockchain', {
        network: network.name,
        chainId: Number(network.chainId)  // Convert BigInt to number for logging
      });

      // Create signer (backend's wallet for paying gas)
      this.signer = new ethers.Wallet(this.privateKey, this.provider);
      logger.info('CONFIG', 'Signer initialized', {
        address: this.signer.address
      });

      // Create contract instance
      this.contract = new ethers.Contract(
        this.contractAddress,
        SAFEGIRL_ABI,
        this.signer
      );

      logger.success('CONFIG', 'Contract instance created', {
        contractAddress: this.contractAddress
      });

      return true;
    } catch (error) {
      logger.error('CONFIG', 'Failed to initialize contract', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get contract instance
   */
  getContract() {
    if (!this.contract) {
      throw new Error('Contract not initialized. Call initialize() first.');
    }
    return this.contract;
  }

  /**
   * Get signer (backend wallet)
   */
  getSigner() {
    if (!this.signer) {
      throw new Error('Signer not initialized. Call initialize() first.');
    }
    return this.signer;
  }

  /**
   * Get provider (blockchain connection)
   */
  getProvider() {
    if (!this.provider) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    return this.provider;
  }
}

// Export singleton instance
module.exports = new ContractManager();
