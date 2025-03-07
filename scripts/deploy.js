// Deploy TwitterVerification contract to Sepolia
// npx hardhat run scripts/deploy.js --network sepolia

const hre = require("hardhat");
const fs = require('fs');

async function main() {
  console.log("Deploying TwitterVerification contract to Sepolia...");

  // Deploy the contract
  console.log("Deploying TwitterVerification...");
  const TwitterVerification = await hre.ethers.getContractFactory("TwitterVerification");
  const twitterVerification = await TwitterVerification.deploy();
  console.log("Waiting for deployment transaction...");
  
  // Wait for deployment
  await twitterVerification.waitForDeployment();
  
  // Get the deployed contract address
  const contractAddress = await twitterVerification.getAddress();
  console.log("TwitterVerification deployed to:", contractAddress);
  
  // Write the address to a file for easy access
  fs.writeFileSync('contract-address.txt', contractAddress);
  console.log("Contract address saved to contract-address.txt");
  
  // Fund the contract with ETH for rewards (0.1 ETH for 10 rewards)
  console.log("\nFunding the contract with ETH for rewards...");
  const [signer] = await hre.ethers.getSigners();
  
  const fundAmount = hre.ethers.parseEther("0.01");
  const fundTx = await signer.sendTransaction({
    to: contractAddress,
    value: fundAmount
  });
  
  console.log("Waiting for funding transaction...");
  await fundTx.wait();
  
  // Check contract balance
  const contractBalance = await hre.ethers.provider.getBalance(contractAddress);
  console.log("Contract ETH balance:", hre.ethers.formatEther(contractBalance));
  
  console.log("\nDeployment and funding successful!");
  console.log("Contract address:", contractAddress);
  console.log("You can now use the app to interact with this contract.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });