/**
 * SafeGirl Contract Deployment Script
 * Deploys the SafeGirl contract to the specified network
 */

async function main() {
  console.log("🚀 Deploying SafeGirl contract...\n");

  // Get the first account (will be the contract owner)
  const [deployer] = await ethers.getSigners();
  console.log("📍 Deploying with account:", deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH\n");

  // Deploy SafeGirl contract
  const SafeGirl = await ethers.getContractFactory("SafeGirl");
  const safeGirl = await SafeGirl.deploy(deployer.address);

  // Wait for deployment to complete
  await safeGirl.waitForDeployment();
  const contractAddress = await safeGirl.getAddress();

  console.log("✅ SafeGirl contract deployed successfully!");
  console.log("📄 Contract Address:", contractAddress);
  console.log("👤 Owner:", deployer.address);

  // Verify contract state
  const questionsCount = await safeGirl.getQuestionsCount();
  console.log("📋 Questions initialized:", questionsCount);

  console.log("\n✨ Deployment complete!");
  console.log("\n📌 Update your .env file with:");
  console.log(`DEPLOYED_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`);

  return contractAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
