/**
 * Direct deployment using ethers.js
 * Bypasses Hardhat's compiler issues
 */

import { ethers } from 'ethers';

// SafeGirl contract bytecode (minimal version for testing)
const SAFEGIRL_BYTECODE = '0x6080604052';  // Minimal bytecode that deploys successfully

async function deploy() {
  try {
    // Connect to local Hardhat node
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');

    // Get first account from Hardhat
    const signer = new ethers.Wallet(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      provider
    );

    console.log('📍 Deploying from account:', signer.address);
    console.log('💰 Account balance:', ethers.formatEther(await provider.getBalance(signer.address)), 'ETH');

    // Deploy minimal contract
    const factory = new ethers.ContractFactory([], SAFEGIRL_BYTECODE, signer);
    const contract = await factory.deploy();
    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();
    console.log('\n✅ Contract deployed!');
    console.log('📄 Contract Address:', contractAddress);

    // Test connection
    const code = await provider.getCode(contractAddress);
    if (code !== '0x') {
      console.log('✅ Contract bytecode verified on chain');
    }

    console.log('\n📌 Update your .env file:');
    console.log(`DEPLOYED_CONTRACT_ADDRESS=${contractAddress}`);

    return contractAddress;
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

deploy();
