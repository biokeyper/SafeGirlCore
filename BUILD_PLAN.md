# SafeGirlCore - Build & Implementation Plan

**Project Goal:** Build a decentralized reporting system for survivors of gender-based violence with on-chain immutability, IPFS storage, and encrypted reports.

**Status:** Starting Phase 1 - Smart Contract Foundation

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React Native)                  │
│   - Text/Audio Report Input                                 │
│   - Local SQLite Storage                                    │
│   - Web3.js Integration for Wallet Connection              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend API (Node.js/Express)                  │
│   - /api/submitReport - Handle submissions                 │
│   - IPFS Upload Service - Store encrypted payload          │
│   - Blockchain Interaction - Write to smart contract       │
│   - Encryption/Decryption - Client-side & server-side      │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
    ┌──────────────┐        ┌──────────────┐
    │   IPFS/      │        │  Blockchain  │
    │   Web3.      │        │  (Polygon/   │
    │   Storage    │        │   BSC/Eth)   │
    │              │        │              │
    │ Encrypted    │        │ Hashes & CIDs│
    │ Payloads     │        │ Consent Logs │
    └──────────────┘        └──────────────┘
```

---

## Phase 1: Smart Contract Foundation ✅ IN PROGRESS

### Goals
- Fix security/gas vulnerabilities in `girlcorechain.sol`
- Set up Hardhat testing framework
- Write comprehensive unit tests
- Validate contract behavior with test vectors

### Tasks

#### 1.1: Fix Smart Contract Vulnerabilities
**Status:** PENDING
**Description:** Address the 5 critical bugs identified in `girlcorechain.sol`

- [ ] Fix `getActiveConsents()` array bounds mismatch (Bug #1)
- [ ] Add pagination/limits to prevent unbounded loops (Bug #2)
- [ ] Add string length validation to `submitReport()` and `updateReport()` (Bug #3)
- [ ] Optimize string handling in `panic()` function (Bug #4)
- [ ] Replace assembly hack with standard array patterns (Bug #5)

**Files to modify:**
- `girlcorechain.sol` - Main contract

**Success criteria:**
- All validation checks pass
- Gas estimates stay reasonable (<200k for typical operations)
- No unbounded loops remain

---

#### 1.2: Set Up Hardhat Development Environment
**Status:** PENDING
**Description:** Initialize Hardhat for contract testing and deployment

- [ ] Install Hardhat: `npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox`
- [ ] Run `npx hardhat init` (select "Create an advanced sample project")
- [ ] Configure `hardhat.config.js` for Polygon/BSC testnets
- [ ] Set up environment variables for private keys (create `.env` file with example)
- [ ] Install additional tools: `npm install --save-dev @openzeppelin/contracts`

**Files to create:**
- `hardhat.config.js` - Hardhat configuration
- `.env.example` - Template for environment variables
- `contracts/SafeGirl.sol` - Move contract to contracts folder
- `contracts/SafeGirlFixed.sol` - Fixed version after bug fixes

**Success criteria:**
- `npx hardhat compile` works without errors
- All OpenZeppelin imports resolve
- Network configurations are set up

---

#### 1.3: Write Comprehensive Unit Tests
**Status:** PENDING
**Description:** Write tests for all contract functions using Hardhat + ethers.js + Chai

- [ ] Test `submitReport()` - valid and invalid submissions
- [ ] Test `updateReport()` - updating existing reports
- [ ] Test `grantAccess()` - consent granting logic
- [ ] Test `revokeAccess()` - consent revocation
- [ ] Test `batchRevokeAccess()` - batch operations
- [ ] Test `getActiveConsents()` - filtering active and expired consents
- [ ] Test `panic()` - emergency alert
- [ ] Test `setEmergencyContact()` - emergency contact management
- [ ] Test access control - only owner can call admin functions
- [ ] Test edge cases - boundary conditions, empty inputs, large data

**Test file:** `test/SafeGirl.test.js`

**Success criteria:**
- All tests pass: `npx hardhat test`
- >90% code coverage
- No warnings or errors
- Gas reports generated

---

#### 1.4: Create Test Vectors and Validation
**Status:** PENDING
**Description:** Document expected inputs/outputs and validate with test data

- [ ] Define canonical payload format (see `canonical-payload-schema.md`)
- [ ] Create test vectors with known hashes
- [ ] Validate hash computation matches between SHA-256 and keccak256
- [ ] Test with data from `test-reports/` directory

**Files:**
- `test-reports/test-vectors.md` - Expected outputs
- `utils/hashReport.js` - Updated with fixes

**Success criteria:**
- Test vectors match contract expectations
- Hash computation is deterministic and reproducible

---

## Phase 2: Backend API & IPFS Integration 🔄 NEXT

### Goals
- Create Node.js/Express API server
- Implement IPFS upload and pinning
- Handle encryption/decryption
- Write blockchain transactions

### Tasks

#### 2.1: Set Up Express Backend
**Status:** PENDING
**Description:** Create backend API structure

- [ ] Initialize separate `backend/` directory with `npm init`
- [ ] Install Express, dotenv, cors, ethers.js: `npm install express dotenv cors ethers`
- [ ] Create `server.js` entry point
- [ ] Set up environment variables (private key, RPC URL, contract address)
- [ ] Create route handlers in `routes/`
- [ ] Add error handling and logging middleware

**Files to create:**
- `backend/server.js`
- `backend/.env.example`
- `backend/routes/reports.js`
- `backend/middleware/errorHandler.js`

**Success criteria:**
- Server starts on `localhost:3001`
- Health check endpoint returns 200 OK
- CORS is properly configured

---

#### 2.2: Implement IPFS Integration (Web3.Storage)
**Status:** PENDING
**Description:** Set up file upload to IPFS with pinning

- [ ] Sign up for Web3.Storage (free tier available)
- [ ] Get API token and store in `.env`
- [ ] Create IPFS service: `backend/services/ipfs.js`
- [ ] Implement file upload function
- [ ] Test upload with sample encrypted payloads
- [ ] Implement CID retrieval and verification

**Code structure:**
```javascript
// backend/services/ipfs.js
- uploadToIPFS(encryptedBuffer) -> returns CID
- retrieveFromIPFS(cid) -> returns buffer
- pinFile(cid) -> ensures persistence
```

**Success criteria:**
- Test upload creates valid IPFS CID
- Retrieved file matches uploaded content
- Files persist on Web3.Storage

---

#### 2.3: Implement Report Submission Endpoint
**Status:** PENDING
**Description:** Create `/api/submitReport` HTTP endpoint

- [ ] POST `/api/submitReport` accepts:
  ```json
  {
    "reportHash": "0xabc...",
    "encryptedPayload": "<buffer>",
    "metadata": {...},
    "signature": "0x..."
  }
  ```
- [ ] Validate inputs and signatures
- [ ] Upload encrypted payload to IPFS
- [ ] Call smart contract `submitReport(ipfsHash, responses)`
- [ ] Return transaction hash and submission ID
- [ ] Handle errors gracefully (retry logic, queuing)

**Files to create:**
- `backend/routes/reports.js` - Endpoint implementation
- `backend/services/blockchain.js` - Contract interaction
- `backend/controllers/reportController.js` - Business logic

**Success criteria:**
- Endpoint accepts valid submissions
- Returns transaction hash and CID
- Rejects invalid data with 400 errors
- Transaction confirmed on blockchain

---

#### 2.4: Implement Report Status Tracking
**Status:** PENDING
**Description:** Create `/api/reportStatus` endpoint for tracking submissions

- [ ] GET `/api/reportStatus?submissionId=...` returns:
  ```json
  {
    "status": "pending|confirmed|failed",
    "txHash": "0x...",
    "blockNumber": 12345,
    "confirmations": 5
  }
  ```
- [ ] Track transaction confirmation
- [ ] Listen to contract events
- [ ] Store submission history in database (optional for MVP)

**Files to create:**
- `backend/routes/status.js` - Status endpoint
- `backend/services/eventListener.js` - Listen to contract events

**Success criteria:**
- Endpoint returns accurate status
- Works with Hardhat local testnet
- Works with testnet (Mumbai/BSC Testnet)

---

## Phase 3: Frontend Integration 🔄 FUTURE

### Goals
- Add Web3 functionality to React Native frontend
- Implement encryption client-side
- Connect to backend API
- Handle wallet integration

### Tasks

#### 3.1: Add Web3 Libraries to Frontend
**Status:** PENDING
**Description:** Install necessary web3/crypto libraries

- [ ] Install ethers.js: `npm install ethers`
- [ ] Install encryption library: `npm install tweetnacl` or `libsodium`
- [ ] Install IPFS client (if direct upload): `npm install web3.storage`
- [ ] Update `package.json` with new dependencies

**Files to modify:**
- `package.json` - Add dependencies

**Success criteria:**
- All libraries install without errors
- No version conflicts
- Imports work in TypeScript environment

---

#### 3.2: Implement Client-Side Encryption
**Status:** PENDING
**Description:** Encrypt reports before uploading

- [ ] Create encryption service in frontend
- [ ] Generate encryption key from user password or session
- [ ] Encrypt text and audio reports before submission
- [ ] Compute SHA-256 hash of encrypted payload
- [ ] Display encrypted status to user

**Files to create:**
- `services/encryption.ts` - Encryption/decryption logic
- `utils/crypto.ts` - Hash computation

**Success criteria:**
- Encryption is deterministic (same input = same output)
- Hash computation matches backend
- Decryption recovers original content

---

#### 3.3: Create Report Submission UI
**Status:** PENDING
**Description:** Add submit button and flow to existing report screens

- [ ] Add "Submit Report" button to `app/text-report.tsx`
- [ ] Add "Submit Recording" button to `app/(tabs)/record.tsx`
- [ ] Show submission status (pending, submitted, failed)
- [ ] Display transaction hash and IPFS CID
- [ ] Handle retry logic for failed submissions
- [ ] Update report status in SQLite after successful submission

**Files to modify:**
- `app/text-report.tsx` - Text submission UI
- `app/(tabs)/record.tsx` - Audio submission UI
- `services/storage.ts` - Add submission status tracking

**Success criteria:**
- Users can submit reports from the app
- Submission status is visible
- Error messages are clear and actionable

---

#### 3.4: Implement Wallet Connection
**Status:** PENDING
**Description:** Add Metamask/WalletConnect integration (optional for MVP)

- [ ] Option A (Recommended): Backend handles signing (no wallet needed in app)
- [ ] Option B: App manages private key (more complex UX)
- [ ] Display wallet address if connected
- [ ] Show balance for gas fees
- [ ] Handle wallet errors gracefully

**Files to create:**
- `services/wallet.ts` - Wallet management
- `components/WalletConnect.tsx` - Connection UI

**Success criteria:**
- App can read wallet address
- Displays connected status
- Graceful error handling

---

## Testing & Deployment Strategy

### Local Testing (Hardhat)
1. Deploy contract to Hardhat local network
2. Run all unit tests
3. Test API endpoints against local contract
4. Create test data and verify hashes

### Testnet Testing (Mumbai/BSC Testnet)
1. Deploy to Mumbai or BSC Testnet
2. Get testnet tokens from faucet
3. Test full submission flow end-to-end
4. Verify IPFS pinning and retrieval
5. Test frontend submission

### Production Deployment
1. Deploy to Polygon mainnet
2. Set up monitoring and alerts
3. Document deployment steps
4. Create emergency procedures

---

## Dependencies by Phase

### Phase 1: Smart Contract
```json
{
  "devDependencies": {
    "hardhat": "^2.14.0",
    "@nomicfoundation/hardhat-toolbox": "^3.0.0",
    "@openzeppelin/contracts": "^4.9.0"
  }
}
```

### Phase 2: Backend
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "ethers": "^6.4.0",
    "web3.storage": "^4.5.0",
    "dotenv": "^16.0.3"
  }
}
```

### Phase 3: Frontend
```json
{
  "dependencies": {
    "ethers": "^6.4.0",
    "tweetnacl": "^1.0.3"
  }
}
```

---

## Success Metrics

| Phase | Metric | Target |
|-------|--------|--------|
| 1 | Contract tests passing | 100% |
| 1 | Code coverage | >90% |
| 1 | Gas for submitReport | <150k |
| 2 | API response time | <500ms |
| 2 | IPFS upload time | <5s |
| 2 | End-to-end submission | <10s |
| 3 | Frontend submission success | >95% |
| 3 | User experience rating | 4+ stars |

---

## Risk & Mitigation

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Smart contract bugs | HIGH | Extensive testing, code audit |
| IPFS outages | MEDIUM | Multiple pinning services, fallback |
| Gas price spikes | MEDIUM | Dynamic gas estimation, batch submissions |
| Wallet integration complexity | MEDIUM | Use backend relayer pattern |
| User encryption key management | HIGH | Use password-derived keys, clear docs |

---

## Timeline Overview

- **Phase 1** (Smart Contract): 2-3 days
  - Fix bugs: 1 day
  - Hardhat setup: 0.5 days
  - Test writing: 1 day
  - Validation: 0.5 days

- **Phase 2** (Backend): 3-4 days
  - API setup: 1 day
  - IPFS integration: 1 day
  - Blockchain interaction: 1 day
  - Testing: 1 day

- **Phase 3** (Frontend): 3-4 days
  - Web3 setup: 0.5 days
  - Encryption: 1 day
  - UI implementation: 1.5 days
  - Testing & debugging: 1 day

---

## Key Decisions Made

1. **Backend Relayer Pattern** - Backend pays for gas, app doesn't need private key
2. **Client-side Encryption** - User data encrypted before leaving device
3. **Web3.Storage** - Simple, reliable IPFS pinning
4. **Hardhat for Testing** - Industry standard, excellent documentation
5. **Polygon for Mainnet** - Low fees, fast finality, active community

---

## Documentation to Create

- [ ] `CONTRACT_API.md` - Solidity function documentation
- [ ] `BACKEND_API.md` - HTTP endpoint documentation
- [ ] `ENCRYPTION_SPEC.md` - Encryption key derivation and payload format
- [ ] `DEPLOYMENT_GUIDE.md` - Step-by-step deployment instructions
- [ ] `TESTING_GUIDE.md` - How to run tests locally
- [ ] `ARCHITECTURE.md` - System design and data flow

---

## Next Steps

1. ✅ Review this plan and approve
2. Start Phase 1.1: Fix smart contract bugs
3. Start Phase 1.2: Set up Hardhat
4. Start Phase 1.3: Write tests
5. Validate with Phase 1.4: Test vectors

Let's build! 🚀
