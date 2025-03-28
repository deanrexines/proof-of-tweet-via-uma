# Twitter Verifier

Prove that a given Twitter user tweeted out a specific text within one of their tweets.

## Deployment

Update .env with your values
```
PRIVATE_KEY=YOUR_EOA_PK_WITHOUT_0x_PREFIX
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_API_KEY
```

From root directory, to deploy TwitterVerifier contract:
```
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

## Running the Application

To run the app:
```
cd frontend/
npm start
```

## User Flow

* Connect ETH wallet > Sepolia testnet
* Enter Twitter username
* Enter text you'd like to verify whether that user has ever tweeted or not, before or at the current timestamp
* Click "Submit Claim"
* Click "Check Status" during challenge window for info
* Click "Settle Claim" after challenge window (default=~2hr)
* Receive 0.01 SepoliaETH if it's settled via UMA
* Contract verifies UMA claim verification and pays out directly from contract balance

## Links

* **Vercel live app:** https://proof-of-tweet-via-uma.vercel.app/
* **Sepolia contract:** 0x5Afe91b48A76C2633e90Ce95d10DCc30269B7585
* **Sample successful claim settlement tx (including reward payout):** https://sepolia.etherscan.io/tx/0x11428583a45dfdcede3a94accd8012de4567147a018e6a0586b26e202ef9d51e

This is generated by submitting and successfully verifying a claim using the author's own twitter handle, @drextron, and checking whether he's ever tweeted "Life is short, test in prod" (he has, it's his pinned tweet)