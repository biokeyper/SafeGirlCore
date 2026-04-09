/**
 * IPFS Fallback Service
 * Implements multi-provider IPFS upload with automatic fallback
 * Primary: Pinata (reliable pinning service)
 * Fallback: Direct IPFS node or alternative provider
 */

import FormData from 'form-data';
import axios from 'axios';
import logger from '../utils/logger';

interface UploadProvider {
  name: string;
  upload: (data: Buffer, filename: string) => Promise<string>;
  isAvailable: () => boolean;
}

class IPFSFallbackService {
  private providers: UploadProvider[] = [];
  private lastSuccessfulProvider: string | null = null;

  constructor() {
    this.initializeProviders();
  }

  /**
   * Initialize all available IPFS providers
   */
  private initializeProviders(): void {
    // Provider 1: Pinata (primary)
    this.providers.push({
      name: 'Pinata',
      upload: this.uploadToPinata.bind(this),
      isAvailable: () => !!process.env.PINATA_JWT,
    });

    // Provider 2: IPFS Kubo RPC (fallback)
    this.providers.push({
      name: 'IPFS-RPC',
      upload: this.uploadToIPFSRPC.bind(this),
      isAvailable: () => !!process.env.IPFS_RPC_URL || true, // Can default to public RPC
    });

    // Provider 3: Nft.storage (alternative fallback)
    this.providers.push({
      name: 'NFT.storage',
      upload: this.uploadToNFTStorage.bind(this),
      isAvailable: () => !!process.env.NFT_STORAGE_API_KEY,
    });

    logger.info('IPFS_FALLBACK', 'IPFS fallback service initialized', {
      availableProviders: this.providers
        .filter(p => p.isAvailable())
        .map(p => p.name),
    });
  }

  /**
   * Upload to Pinata (primary provider)
   */
  private async uploadToPinata(data: Buffer, filename: string): Promise<string> {
    const token = process.env.PINATA_JWT;
    if (!token) {
      throw new Error('PINATA_JWT not configured');
    }

    try {
      const formData = new FormData();
      formData.append('file', data, { filename, contentType: 'application/octet-stream' });
      formData.append('pinataMetadata', JSON.stringify({ name: filename }));
      formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

      const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
        maxBodyLength: Infinity as any,
        maxContentLength: Infinity as any,
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${token}`,
        },
        timeout: 30000,
      });

      const cid = response.data?.IpfsHash;
      if (!cid) {
        throw new Error('No IPFS hash in response');
      }

      logger.info('IPFS_FALLBACK', 'Pinata upload successful', { cid, size: data.length });
      this.lastSuccessfulProvider = 'Pinata';
      return cid;
    } catch (error) {
      logger.warn('IPFS_FALLBACK', 'Pinata upload failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Upload to IPFS RPC endpoint (fallback)
   */
  private async uploadToIPFSRPC(data: Buffer, filename: string): Promise<string> {
    const rpcUrl = process.env.IPFS_RPC_URL || 'http://localhost:5001';

    try {
      const formData = new FormData();
      formData.append('file', data, { filename });

      const response = await axios.post(`${rpcUrl}/api/v0/add`, formData, {
        headers: formData.getHeaders(),
        timeout: 30000,
      });

      // IPFS RPC returns newline-delimited JSON
      const lines = response.data.split('\n').filter((line: string) => line.trim());
      const lastLine = JSON.parse(lines[lines.length - 1]);
      const cid = lastLine.Hash;

      if (!cid) {
        throw new Error('No IPFS hash in response');
      }

      logger.info('IPFS_FALLBACK', 'IPFS RPC upload successful', { cid, size: data.length });
      this.lastSuccessfulProvider = 'IPFS-RPC';
      return cid;
    } catch (error) {
      logger.warn('IPFS_FALLBACK', 'IPFS RPC upload failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Upload to nft.storage (alternative fallback)
   */
  private async uploadToNFTStorage(data: Buffer, filename: string): Promise<string> {
    const apiKey = process.env.NFT_STORAGE_API_KEY;
    if (!apiKey) {
      throw new Error('NFT_STORAGE_API_KEY not configured');
    }

    try {
      const formData = new FormData();
      formData.append('file', data, { filename });

      const response = await axios.post('https://api.nft.storage/upload', formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      });

      const cid = response.data?.value?.cid || response.data?.cid;
      if (!cid) {
        throw new Error('No IPFS hash in response');
      }

      logger.info('IPFS_FALLBACK', 'nft.storage upload successful', { cid, size: data.length });
      this.lastSuccessfulProvider = 'NFT.storage';
      return cid;
    } catch (error) {
      logger.warn('IPFS_FALLBACK', 'nft.storage upload failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Upload with automatic fallback
   * Tries providers in order: last successful first, then primary, then others
   */
  async uploadToIPFS(data: Buffer, filename: string): Promise<string> {
    if (!data || data.length === 0) {
      throw new Error('Empty data');
    }

    logger.info('IPFS_FALLBACK', 'Starting IPFS upload with fallback', {
      filename,
      size: data.length,
      lastSuccessful: this.lastSuccessfulProvider,
    });

    // Sort providers: last successful first
    const sortedProviders = [...this.providers].sort((a, b) => {
      if (a.name === this.lastSuccessfulProvider) return -1;
      if (b.name === this.lastSuccessfulProvider) return 1;
      return 0;
    });

    const errors: { provider: string; error: string }[] = [];

    for (const provider of sortedProviders) {
      if (!provider.isAvailable()) {
        logger.debug('IPFS_FALLBACK', `${provider.name} not available, skipping`);
        continue;
      }

      try {
        logger.info('IPFS_FALLBACK', `Attempting upload with ${provider.name}`);
        const cid = await provider.upload(data, filename);
        logger.success('IPFS_FALLBACK', `Upload successful with ${provider.name}`, { cid });
        return cid;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ provider: provider.name, error: errorMsg });
        logger.warn('IPFS_FALLBACK', `${provider.name} upload failed, trying next provider`, {
          error: errorMsg,
        });
      }
    }

    // All providers failed
    logger.error('IPFS_FALLBACK', 'All IPFS providers failed', {
      errors,
      availableProviders: this.providers.filter(p => p.isAvailable()).map(p => p.name),
    });

    throw new Error(
      `IPFS upload failed on all providers: ${errors.map(e => `${e.provider}: ${e.error}`).join('; ')}`
    );
  }

  /**
   * Retrieve file from IPFS via public gateway
   * Works with any IPFS hash from any provider
   */
  async retrieveFromIPFS(cid: string): Promise<Buffer> {
    if (!cid || typeof cid !== 'string') {
      throw new Error('Invalid CID');
    }

    const gateways = [
      `https://gateway.pinata.cloud/ipfs/${cid}`,
      `https://ipfs.io/ipfs/${cid}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}`,
      `https://gateway.nft.storage/ipfs/${cid}`,
    ];

    logger.info('IPFS_FALLBACK', 'Retrieving from IPFS', { cid });

    for (const gateway of gateways) {
      try {
        const response = await axios.get(gateway, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });
        logger.success('IPFS_FALLBACK', 'Retrieved from IPFS', { cid, gateway });
        return Buffer.from(response.data);
      } catch (error) {
        logger.warn('IPFS_FALLBACK', `Gateway ${gateway} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error(`Failed to retrieve ${cid} from all gateways`);
  }

  /**
   * Get upload statistics
   */
  getStats(): any {
    return {
      availableProviders: this.providers.filter(p => p.isAvailable()).map(p => p.name),
      lastSuccessfulProvider: this.lastSuccessfulProvider,
      totalProviders: this.providers.length,
    };
  }
}

export default new IPFSFallbackService();
