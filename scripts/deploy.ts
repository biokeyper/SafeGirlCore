import { ethers } from "ethers";
import { readFileSync } from "fs";
import { resolve } from "path";

interface Artifact {
  abi: unknown[];
  bytecode: string;
}

async function main(): Promise<void> {
  console.log("Starting SafeGirl contract deployment...\n");

  // Load environment variables
  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    throw new Error("Missing POLYGON_AMOY_RPC_URL or PRIVATE_KEY in .env");
  }

  console.log(`Connecting to Polygon Amoy RPC: ${rpcUrl.substring(0, 40)}...`);

  // Create provider and signer
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  console.log(`Deployer address: ${signer.address}`);

  // Read contract ABI and bytecode
  const artifactPath = resolve(
    "./artifacts/contracts/SafeGirl.sol/SafeGirl.json",
  );
  const artifact: Artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  const { abi, bytecode } = artifact;

  console.log("Deploying SafeGirl contract...");

  // Create contract factory and deploy (pass owner address to constructor)
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy(signer.address);

  // Wait for deployment
  const deploymentTx = contract.deploymentTransaction();
  if (!deploymentTx) {
    throw new Error("Deployment failed");
  }

  const receipt = await deploymentTx.wait();

  if (!receipt) {
    throw new Error("Deployment receipt not available");
  }

  const deployedAddress = await contract.getAddress();

  console.log("SafeGirl deployed successfully!");
  console.log(`Contract Address: ${deployedAddress}`);
  console.log(`Transaction Hash: ${receipt.hash}`);
  console.log(`Block Number: ${receipt.blockNumber}`);
  console.log("\nIMPORTANT: Update your .env file with this address:");
  console.log(`DEPLOYED_CONTRACT_ADDRESS=${deployedAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error("Deployment failed:", error.message);
    process.exit(1);
  });
