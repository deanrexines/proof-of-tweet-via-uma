// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IOptimisticOracleV3.sol";

/**
 * @title TwitterVerification
 * @notice Contract for verifying Twitter posts using UMA's Optimistic Oracle V3
 * @dev Based directly on UMA's minimal OOV3 integration example
 */
contract TwitterVerification {
    // Create an Optimistic Oracle V3 instance at the deployed address on Sepolia
    IOptimisticOracleV3 oov3 =
        IOptimisticOracleV3(0xFd9e2642a170aDD10F53Ee14a93FcF2F31924944);
    
    // Reward amount for successful claims
    uint256 public constant REWARD_AMOUNT = 0.01 ether;
    
    // Store claim details
    struct Claim {
        bytes assertedClaim;
        address claimer;
        string twitterHandle;
        string tweetText;
        bytes32 assertionId;
        bool isResolved;
        bool isRewarded;
    }
    
    // Keep track of claims by ID
    mapping(bytes32 => Claim) public claims;
    
    // Events
    event ClaimSubmitted(bytes32 indexed assertionId, address indexed claimer, string twitterHandle, string tweetText);
    event ClaimResolved(bytes32 indexed assertionId, bool indexed truthful);
    event RewardPaid(bytes32 indexed assertionId, address indexed claimer, uint256 amount);
    
    /**
     * @notice Submit a claim that a Twitter user has posted a specific tweet
     * @param twitterHandle The Twitter username without the @ symbol
     * @param tweetText The exact text of the tweet
     */
    function submitClaim(string calldata twitterHandle, string calldata tweetText) external returns (bytes32) {
        // Create the assertion claim as bytes
        bytes memory assertedClaim = bytes(string(abi.encodePacked(
            "Twitter user @",
            twitterHandle,
            " posted a tweet with the exact text: '",
            tweetText,
            "' as of timestamp ",
            block.timestamp
        )));
        
        // Assert the truth using UMA's OOV3 exactly as in their example
        // This includes default values for challenge window, etc.
        bytes32 assertionId = oov3.assertTruthWithDefaults(assertedClaim, address(this));
        
        // Store claim details
        claims[assertionId] = Claim({
            assertedClaim: assertedClaim,
            claimer: msg.sender,
            twitterHandle: twitterHandle,
            tweetText: tweetText,
            assertionId: assertionId,
            isResolved: false,
            isRewarded: false
        });
        
        emit ClaimSubmitted(assertionId, msg.sender, twitterHandle, tweetText);
        
        return assertionId;
    }
    
    /**
     * @notice Settle the assertion and get the result using UMA 
     * @param assertionId The ID of the assertion to settle
     */
    function settleAndGetAssertionResult(bytes32 assertionId) public returns (bool) {
        // Make sure the claim exists
        require(claims[assertionId].claimer != address(0), "Claim does not exist");
        
        // Call UMA to settle the assertion
        bool result = oov3.settleAndGetAssertionResult(assertionId);
        
        // Update claim status
        claims[assertionId].isResolved = true;
        
        emit ClaimResolved(assertionId, result);
        
        // If the assertion was true, send the reward
        if (result && !claims[assertionId].isRewarded) {
            // Make sure we have enough ETH
            require(address(this).balance >= REWARD_AMOUNT, "Insufficient contract balance");
            
            // Update reward status and send the reward
            claims[assertionId].isRewarded = true;
            payable(claims[assertionId].claimer).transfer(REWARD_AMOUNT);
            
            emit RewardPaid(assertionId, claims[assertionId].claimer, REWARD_AMOUNT);
        }
        
        return result;
    }
    
    /**
     * @notice Just return the assertion result, exactly as in the UMA example
     * @param assertionId The ID of the assertion to check
     */
    function getAssertionResult(bytes32 assertionId) public view returns (bool) {
        return oov3.getAssertionResult(assertionId);
    }
    
    /**
     * @notice Return the full assertion object, exactly as in the UMA example
     * @param assertionId The ID of the assertion to check
     */
    function getAssertion(bytes32 assertionId)
        public
        view
        returns (IOptimisticOracleV3.Assertion memory)
    {
        return oov3.getAssertion(assertionId);
    }
    
    /**
     * @notice Get claim details by assertion ID
     * @param assertionId The ID of the assertion to query
     */
    function getClaimDetails(bytes32 assertionId) external view returns (
        address claimer,
        string memory twitterHandle,
        string memory tweetText,
        bool isResolved,
        bool isRewarded
    ) {
        Claim memory claim = claims[assertionId];
        return (
            claim.claimer,
            claim.twitterHandle,
            claim.tweetText,
            claim.isResolved,
            claim.isRewarded
        );
    }
    
    /**
     * @notice Check if a claim has been verified
     * @param assertionId The ID of the assertion to check
     */
    function isClaimVerified(bytes32 assertionId) external view returns (bool) {
        return claims[assertionId].isResolved && claims[assertionId].isRewarded;
    }
    
    /**
     * @notice Return whether a claim can be settled
     * @param assertionId The ID of the assertion to check
     */
    function canBeSettled(bytes32 assertionId) external view returns (bool) {
    // If the claim doesn't exist, it can't be settled
        if (claims[assertionId].claimer == address(0)) return false;
        
        // If the claim is already resolved, it can't be settled again
        if (claims[assertionId].isResolved) return false;
        
        // Otherwise, we use UMA's assertion data to determine if it can be settled
        IOptimisticOracleV3.Assertion memory assertion = oov3.getAssertion(assertionId);
        
        // An assertion can be settled if:
        // 1. It's not already settled
        // 2. The expirationTime (challenge period end) has passed
        return !assertion.settled && block.timestamp >= assertion.expirationTime;
    }
    /**
     * @notice Fund the contract with ETH for rewards
     */
    receive() external payable {}
}