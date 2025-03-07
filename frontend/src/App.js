import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';

// Contract ABI (functions needed for frontend)
const contractABI = [
  "function submitClaim(string memory twitterHandle, string memory tweetText) external returns (bytes32)",
  "function getClaimDetails(bytes32 assertionId) external view returns (address claimer, string memory twitterHandle, string memory tweetText, bool isResolved, bool isRewarded)",
  "function settleAndGetAssertionResult(bytes32 assertionId) public returns (bool)",
  "function isClaimVerified(bytes32 assertionId) external view returns (bool)",
  "function canBeSettled(bytes32 assertionId) external view returns (bool)",
  "function getAssertionResult(bytes32 assertionId) external view returns (bool)",
  "function getAssertion(bytes32 assertionId) external view returns (tuple(bool validated, bool resolved, bool settlementResolution, address asserter, address challenger, uint64 settlementTimestamp))",
  "event ClaimSubmitted(bytes32 indexed assertionId, address indexed claimer, string twitterHandle, string tweetText)"
];

// Deployed TwitterVerification contract on Sepolia
const CONTRACT_ADDRESS = "0x5Afe91b48A76C2633e90Ce95d10DCc30269B7585";

function App() {
  const [twitterHandle, setTwitterHandle] = useState('');
  const [tweetText, setTweetText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [walletConnected, setWalletConnected] = useState(false);
  const [contractBalance, setContractBalance] = useState(null);
  const [assertionId, setAssertionId] = useState('');
  const [claimStatus, setClaimStatus] = useState(null);
  const [assertionDetails, setAssertionDetails] = useState(null);
  const [canSettle, setCanSettle] = useState(false);
  const [txHash, setTxHash] = useState('');

  // Connect wallet and check network
  async function connectWallet() {
    if (window.ethereum) {
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // Check if we're on Sepolia
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const network = await provider.getNetwork();
        
        if (network.chainId !== 11155111) { // Sepolia chain ID
          setError('Please connect to Sepolia testnet');
          return false;
        }
        
        setWalletConnected(true);
        setError('');
        
        // Get contract balance
        const balance = await provider.getBalance(CONTRACT_ADDRESS);
        setContractBalance(ethers.utils.formatEther(balance));
        
        return true;
      } catch (err) {
        setError('Failed to connect wallet: ' + err.message);
        return false;
      }
    } else {
      setError('MetaMask not detected. Please install MetaMask.');
      return false;
    }
  }

  // Submit claim to the contract
  async function submitClaim() {
    setError('');
    setResult(null);
    
    if (!twitterHandle || !tweetText) {
      setError('Please enter both Twitter handle and tweet text');
      return;
    }
    
    if (!walletConnected) {
      const connected = await connectWallet();
      if (!connected) return;
    }
    
    try {
      setLoading(true);
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, signer);
      
      // Remove @ if user included it
      const cleanHandle = twitterHandle.startsWith('@') 
        ? twitterHandle.substring(1) 
        : twitterHandle;
      
      console.log("Submitting claim with params:", cleanHandle, tweetText);
      
      // Submit the claim to the contract
      const tx = await contract.submitClaim(cleanHandle, tweetText, {
        gasLimit: 1000000
      });
      
      console.log("Transaction sent:", tx.hash);
      setTxHash(tx.hash); // Store the transaction hash for later use
      
      setResult({
        status: 'Claim submitted',
        message: 'Transaction submitted. Waiting for confirmation...',
        txHash: tx.hash
      });
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);
      
      // Try to find the assertion ID from the receipt logs
      const id = await findAssertionIdFromReceipt(receipt, contract);
      
      if (id) {
        setAssertionId(id);
        
        setResult({
          status: 'Claim processed',
          message: 'Your claim has been submitted. The verification will be completed once the UMA challenge period ends (typically 2 minutes on Sepolia for testing).',
          txHash: tx.hash,
          assertionId: id
        });
      } else {
        setResult({
          status: 'Claim processed',
          message: 'Your claim has been submitted, but we could not automatically extract the assertion ID. Use the "Find Assertion ID" button below or check transaction details on Etherscan.',
          txHash: tx.hash
        });
      }
      
    } catch (err) {
      console.error("Transaction error:", err);
      let errorMessage = "transaction failed";
      if (err.reason) {
        errorMessage = err.reason;
      } else if (err.error && err.error.message) {
        errorMessage = err.error.message;
      } else if (err.data && err.data.message) {
        errorMessage = err.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError('Error submitting claim: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  }

  // Helper function to extract assertion ID from transaction receipt
  async function findAssertionIdFromReceipt(receipt, contract) {
    try {
      // First try our contract's ClaimSubmitted event
      for (const log of receipt.logs) {
        try {
          const parsedLog = contract.interface.parseLog(log);
          if (parsedLog.name === 'ClaimSubmitted') {
            return parsedLog.args.assertionId;
          }
        } catch (e) {
          // Not an event we can parse, continue to next log
        }
      }

      // If that doesn't work, try looking for the UMA contract's AssertionMade event
      for (const log of receipt.logs) {
        // The 0th topic is the event signature
        if (log.topics[0] === ethers.utils.id("AssertionMade(bytes32,bytes32,address,address,address,address,uint64,address,uint256,bytes32,bytes)")) {
          // The 1st topic is the assertion ID in UMA's event
          return log.topics[1];
        }
      }
      
      return null;
    } catch (e) {
      console.error("Error extracting assertion ID:", e);
      return null;
    }
  }

  // Function to find assertion ID from transaction hash
  async function findAssertionIdFromTxHash() {
    if (!txHash) {
      setError("Please enter a transaction hash");
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);
      
      console.log("Looking up transaction:", txHash);
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        setError("Transaction not found or not confirmed yet");
        return;
      }
      
      console.log("Receipt:", receipt);
      
      // Look for the assertion ID in the logs
      const id = await findAssertionIdFromReceipt(receipt, contract);
      
      if (id) {
        setAssertionId(id);
        console.log("Found assertion ID:", id);
        
        // Show success message
        setResult({
          ...result,
          message: `Found assertion ID: ${id}`,
          assertionId: id
        });
        
        // Automatically check the claim status
        await checkClaimStatus(id);
      } else {
        setError("Could not find assertion ID in transaction logs");
      }
    } catch (err) {
      console.error("Error finding assertion ID:", err);
      setError("Error finding assertion ID: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Check status of a claim by assertion ID
  async function checkClaimStatus(idToCheck = null) {
    const idToUse = idToCheck || assertionId;
    
    if (!idToUse) {
      setError('Please enter an assertion ID');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);
      
      // Get claim details from our contract
      const details = await contract.getClaimDetails(idToUse);
      console.log("Claim details:", details);
      
      setClaimStatus({
        claimer: details.claimer,
        twitterHandle: details.twitterHandle,
        tweetText: details.tweetText,
        resolved: details.isResolved,
        rewarded: details.isRewarded
      });
      
      // Get assertion details from UMA
      try {
        const assertion = await contract.getAssertion(idToUse);
        console.log("Assertion details:", assertion);
        
        setAssertionDetails({
          validated: assertion.validated,
          resolved: assertion.resolved,
          settlementResolution: assertion.settlementResolution,
          asserter: assertion.asserter,
          challenger: assertion.challenger,
          settlementTimestamp: assertion.settlementTimestamp ? 
            new Date(Number(assertion.settlementTimestamp) * 1000).toLocaleString() : 'N/A'
        });
        
        // Check if the assertion can be settled
        try {
          const settleable = await contract.canBeSettled(idToUse);
          setCanSettle(settleable);
        } catch (err) {
          console.error("Error checking if can be settled:", err);
          // Force enable settlement if we can't check - let the contract handle validation
          setCanSettle(true);
        }
      } catch (err) {
        console.error("Error getting assertion details:", err);
        // If we can't get assertion details, we'll still allow settlement attempt
        setCanSettle(true);
      }
      
    } catch (err) {
      console.error("Error checking claim:", err);
      setError('Error checking claim: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Settle a claim
  async function settleClaim() {
    if (!assertionId) {
      setError('Please enter an assertion ID');
      return;
    }
    
    if (!walletConnected) {
      const connected = await connectWallet();
      if (!connected) return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, signer);
      
      console.log("Settling claim for assertion ID:", assertionId);
      
      // Try to settle directly without checking if it can be settled
      const tx = await contract.settleAndGetAssertionResult(assertionId, {
        gasLimit: 500000
      });
      
      console.log("Transaction sent:", tx.hash);
      setResult({
        status: 'Claim settlement initiated',
        message: 'Please wait for the transaction to be confirmed...',
        txHash: tx.hash
      });
      
      await tx.wait();
      console.log("Settlement confirmed");
      
      // Check updated status
      await checkClaimStatus();
      
      setResult({
        status: 'Claim settled',
        message: 'The claim has been settled. Check the claim status for details.',
        txHash: tx.hash
      });
      
    } catch (err) {
      console.error("Error settling claim:", err);
      if (err.message && err.message.includes("challenge period")) {
        setError('This claim cannot be settled yet. The UMA challenge period may not have ended. Please wait a few more minutes and try again.');
      } else if (err.message && err.message.includes("already resolved")) {
        setError('This claim has already been resolved. Please refresh the status to see the latest information.');
        await checkClaimStatus();
      } else {
        setError('Error settling claim: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  // Check wallet connection on load
  useEffect(() => {
    if (window.ethereum) {
      connectWallet();
    }
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Twitter Verification Portal</h1>
        {!walletConnected && (
          <button 
            className="connect-button" 
            onClick={connectWallet}
            disabled={loading}
          >
            Connect Wallet
          </button>
        )}
        {walletConnected && contractBalance !== null && (
          <div className="contract-balance">
            Contract balance: {contractBalance} ETH
          </div>
        )}
      </header>
      
      <main className="App-main">
        <div className="form-container">
          <h2>Verify Tweet Claim</h2>
          <p>Enter a Twitter username and tweet text to verify that the user has posted that exact tweet.</p>
          
          <div className="input-group">
            <label htmlFor="twitter-handle">Twitter Username:</label>
            <input
              id="twitter-handle"
              type="text"
              placeholder="username (without @)"
              value={twitterHandle}
              onChange={(e) => setTwitterHandle(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="tweet-text">Tweet Text:</label>
            <textarea
              id="tweet-text"
              placeholder="Enter the exact tweet text"
              value={tweetText}
              onChange={(e) => setTweetText(e.target.value)}
              disabled={loading}
              rows={4}
            />
          </div>
          
          <div className="note">
            <strong>Note:</strong> Submitting a claim uses UMA's default settings on Sepolia.
          </div>
          
          <button
            className="submit-button"
            onClick={submitClaim}
            disabled={loading || !twitterHandle || !tweetText}
          >
            {loading ? 'Processing...' : 'Submit Claim'}
          </button>
          
          <hr />
          
          <h3>Find Assertion ID</h3>
          <div className="input-group">
            <label htmlFor="tx-hash">Transaction Hash:</label>
            <input
              id="tx-hash"
              type="text"
              placeholder="0x..."
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <button
            className="action-button"
            onClick={findAssertionIdFromTxHash}
            disabled={loading || !txHash}
          >
            Find Assertion ID
          </button>
          
          <hr />
          
          <h3>Check or Settle a Claim</h3>
          <div className="input-group">
            <label htmlFor="assertion-id">Assertion ID:</label>
            <input
              id="assertion-id"
              type="text"
              placeholder="0x..."
              value={assertionId}
              onChange={(e) => setAssertionId(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="button-group">
            <button
              className="action-button"
              onClick={() => checkClaimStatus()}
              disabled={loading || !assertionId}
            >
              Check Status
            </button>
            
            <button
              className="action-button"
              onClick={settleClaim}
              disabled={loading || !assertionId}
            >
              Settle Claim
            </button>
          </div>
          
          {claimStatus && (
            <div className="status-container">
              <h4>Claim Status</h4>
              <p><strong>Claimer:</strong> {claimStatus.claimer}</p>
              <p><strong>Twitter Handle:</strong> @{claimStatus.twitterHandle}</p>
              <p><strong>Tweet Text:</strong> {claimStatus.tweetText}</p>
              <p><strong>Resolved in Contract:</strong> {claimStatus.resolved ? 'Yes' : 'No'}</p>
              <p><strong>Rewarded:</strong> {claimStatus.rewarded ? 'Yes' : 'No'}</p>
              
              {assertionDetails && (
                <>
                  <h4>UMA Assertion Details</h4>
                  <p><strong>Settled in UMA:</strong> {assertionDetails.resolved ? 'Yes' : 'No'}</p>
                  <p><strong>Validation Result:</strong> {assertionDetails.settlementResolution ? 'True' : 'False'}</p>
                  <p><strong>Settlement Time:</strong> {assertionDetails.settlementTimestamp}</p>
                  <p><strong>Asserter:</strong> {assertionDetails.asserter}</p>
                  {assertionDetails.challenger !== "0x0000000000000000000000000000000000000000" && (
                    <p><strong>Challenger:</strong> {assertionDetails.challenger}</p>
                  )}
                  <p><strong>Can Be Settled:</strong> {canSettle ? 'Yes' : 'No'}</p>
                </>
              )}
            </div>
          )}
          
          {error && <div className="error-message">{error}</div>}
          
          {result && (
            <div className="result-container">
              <h3>{result.status}</h3>
              <p>{result.message}</p>
              {result.assertionId && (
                <p className="assertion-id">
                  Assertion ID: <code>{result.assertionId}</code>
                </p>
              )}
              {result.txHash && (
                <a 
                  href={`https://sepolia.etherscan.io/tx/${result.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-link"
                >
                  View transaction on Etherscan
                </a>
              )}
            </div>
          )}
        </div>
      </main>
      
      <footer className="App-footer">
        <p>This app uses UMA Protocol on Sepolia testnet to verify Twitter claims on-chain.</p>
      </footer>
    </div>
  );
}

export default App;