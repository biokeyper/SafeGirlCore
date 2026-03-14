/**
 * Contract manager for SafeGirl.
 *
 * This file is the bridge between the backend and the deployed smart contract.
 * It creates and stores three shared objects:
 * - provider: RPC connection used to read blockchain state
 * - signer: backend wallet used to sign transactions
 * - contract: ethers.js contract instance used to call functions/events
 */
const { ethers } = require("ethers");
const logger = require("../utils/logger");

// Contract ABI: tells ethers the callable functions/events and their types.
const SAFEGIRL_ABI = [
  // Backend-owned submit path for app users represented by bytes32 user keys.
  {
    inputs: [
      { name: "_userKey", type: "bytes32" },
      { name: "_ipfsHash", type: "string" },
      { name: "_responses", type: "string[]" },
    ],
    name: "submitReportFor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Direct wallet submit path (not usually used in company-wallet flow).
  {
    inputs: [
      { name: "_ipfsHash", type: "string" },
      { name: "_responses", type: "string[]" },
    ],
    name: "submitReport",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Backend-owned update path for bytes32 user keys.
  {
    inputs: [
      { name: "_userKey", type: "bytes32" },
      { name: "_newIpfsHash", type: "string" },
      { name: "_newResponses", type: "string[]" },
    ],
    name: "updateReportFor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Direct wallet update path.
  {
    inputs: [
      { name: "_newIpfsHash", type: "string" },
      { name: "_newResponses", type: "string[]" },
    ],
    name: "updateReport",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Consent grant function.
  {
    inputs: [
      { name: "_viewer", type: "address" },
      { name: "_customExpiry", type: "uint256" },
    ],
    name: "grantAccess",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Consent revoke function.
  {
    inputs: [{ name: "_viewer", type: "address" }],
    name: "revokeAccess",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Read delegated report metadata by user key.
  {
    inputs: [{ name: "_userKey", type: "bytes32" }],
    name: "getReportStatusFor",
    outputs: [
      { name: "exists", type: "bool" },
      { name: "timestamp", type: "uint256" },
      { name: "ipfsHash", type: "string" },
      { name: "version", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Read direct-wallet report metadata by address.
  {
    inputs: [{ name: "_user", type: "address" }],
    name: "getReportStatus",
    outputs: [
      { name: "exists", type: "bool" },
      { name: "timestamp", type: "uint256" },
      { name: "ipfsHash", type: "string" },
      { name: "version", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // List active consent records for a reporter.
  {
    inputs: [{ name: "_reporter", type: "address" }],
    name: "getActiveConsents",
    outputs: [
      {
        components: [
          { name: "viewer", type: "address" },
          { name: "grantedAt", type: "uint256" },
          { name: "expiresAt", type: "uint256" },
          { name: "active", type: "bool" },
        ],
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Emit panic alert event.
  {
    inputs: [{ name: "_locationData", type: "string" }],
    name: "sendPanicAlert",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Emitted when a delegated report is created.
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "userKey", type: "bytes32" },
      { indexed: true, name: "submitter", type: "address" },
      { indexed: false, name: "timestamp", type: "uint256" },
      { indexed: false, name: "ipfsHash", type: "string" },
      { indexed: false, name: "version", type: "uint256" },
    ],
    name: "ReportSubmittedFor",
    type: "event",
  },
  // Emitted when a delegated report is updated.
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "userKey", type: "bytes32" },
      { indexed: true, name: "submitter", type: "address" },
      { indexed: false, name: "timestamp", type: "uint256" },
      { indexed: false, name: "newIpfsHash", type: "string" },
      { indexed: false, name: "version", type: "uint256" },
    ],
    name: "ReportUpdatedFor",
    type: "event",
  },
  // Emitted when a direct report is created.
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "reporter", type: "address" },
      { indexed: false, name: "timestamp", type: "uint256" },
      { indexed: false, name: "ipfsHash", type: "string" },
      { indexed: false, name: "version", type: "uint256" },
    ],
    name: "ReportSubmitted",
    type: "event",
  },
  // Emitted when a direct report is updated.
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "reporter", type: "address" },
      { indexed: false, name: "timestamp", type: "uint256" },
      { indexed: false, name: "newIpfsHash", type: "string" },
      { indexed: false, name: "version", type: "uint256" },
    ],
    name: "ReportUpdated",
    type: "event",
  },
  // Emitted when consent is granted.
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "reporter", type: "address" },
      { indexed: true, name: "viewer", type: "address" },
      { indexed: false, name: "expiresAt", type: "uint256" },
    ],
    name: "ConsentGranted",
    type: "event",
  },
  // Emitted when consent is revoked.
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "reporter", type: "address" },
      { indexed: true, name: "viewer", type: "address" },
    ],
    name: "ConsentRevoked",
    type: "event",
  },
  // Emitted when panic alert is triggered.
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: false, name: "timestamp", type: "uint256" },
      { indexed: false, name: "locationData", type: "string" },
    ],
    name: "PanicAlert",
    type: "event",
  },
];

class ContractManager {
  // Centralized owner of provider/signer/contract singletons.
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contract = null;

    // Required runtime values from environment.
    this.contractAddress = process.env.DEPLOYED_CONTRACT_ADDRESS;
    // Default to Polygon Amoy if RPC URL is not explicitly provided.
    this.rpcUrl =
      process.env.POLYGON_AMOY_RPC_URL ||
      "https://rpc-amoy.polygon.technology/";
    this.privateKey = process.env.PRIVATE_KEY;
  }

  /**
   * Builds provider, signer, and contract once during server startup.
   * Must be called before getContract/getProvider/getSigner.
   */
  async initialize() {
    try {
      // 1) Connect to the RPC endpoint.
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);

      // 2) Verify network connectivity early so startup fails fast.
      const network = await this.provider.getNetwork();
      logger.success("CONFIG", "Connected to blockchain", {
        network: network.name,
        chainId: Number(network.chainId), // Cast BigInt so log serialization stays simple.
      });

      // 3) Build backend signer (wallet used to send transactions).
      this.signer = new ethers.Wallet(this.privateKey, this.provider);
      logger.info("CONFIG", "Signer initialized", {
        address: this.signer.address,
      });

      // 4) Build typed contract instance bound to signer.
      this.contract = new ethers.Contract(
        this.contractAddress,
        SAFEGIRL_ABI,
        this.signer,
      );

      logger.success("CONFIG", "Contract instance created", {
        contractAddress: this.contractAddress,
      });

      return true;
    } catch (error) {
      logger.error("CONFIG", "Failed to initialize contract", {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Returns initialized contract instance.
   */
  getContract() {
    if (!this.contract) {
      throw new Error("Contract not initialized. Call initialize() first.");
    }
    return this.contract;
  }

  /**
   * Returns initialized backend signer.
   */
  getSigner() {
    if (!this.signer) {
      throw new Error("Signer not initialized. Call initialize() first.");
    }
    return this.signer;
  }

  /**
   * Returns initialized provider.
   */
  getProvider() {
    if (!this.provider) {
      throw new Error("Provider not initialized. Call initialize() first.");
    }
    return this.provider;
  }
}

// Export one shared instance used across the backend.
module.exports = new ContractManager();
