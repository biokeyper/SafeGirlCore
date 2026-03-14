# SafeGirlCore

Women's safety reporting platform with encrypted reports, blockchain verification, and emergency alerts.

**Table of Contents:**

- [Quick Start](#quick-start)
- [Documentation Map](#documentation-map)
- [API Documentation](#api-documentation)
- [Architecture](#architecture)
- [Backend Internals](#backend-internals)
- [Database Schema](#database-schema)
- [Setup Guide](#setup-guide)
- [Smart Contract](#smart-contract)

---

## Quick Start

### Start All Services

```bash
cd /home/mirembe/Desktop/Projects/SafeGirlCore
docker compose up
```

This runs:

- 🌐 **API Documentation (Swagger UI)**: http://localhost:8888
- 🚀 **Backend API**: http://localhost:3001
- 🗄️ **PostgreSQL Database**: localhost:5433

That's it! Your development environment is ready.

---

## Documentation Map

This  `README.md` is the primary onboarding and operating document.

Use it for:

- Setup, run, and deploy steps
- API overview and key request examples
- Current architecture + backend internals
- Smart contract integration summary

---

## API Documentation

**Interactive documentation is available at: http://localhost:8888**

### API Endpoints

#### Authentication (16 endpoints)

- `POST /api/auth/signup/initiate` - Send OTP to phone
- `POST /api/auth/signup/verify` - Verify OTP, create account
- `POST /api/auth/login/initiate` - Send login OTP
- `POST /api/auth/login/verify` - Verify login OTP
- `POST /api/auth/forgot-phone` - Recover account via email (step 1)
- `POST /api/auth/verify-recovery` - Verify recovery token (step 2)
- `POST /api/auth/change-phone/recovery` - Send OTP to new phone (step 3)
- `POST /api/auth/verify-phone-change/recovery` - Verify new phone (step 4)
- `POST /api/auth/change-phone` - Authenticated user change phone
- `POST /api/auth/verify-phone-change` - Verify phone change
- `GET /api/auth/verify` - Verify JWT token
- `POST /api/auth/setup-email` - Setup recovery email
- `POST /api/auth/set-pin` - Set content lock PIN
- `GET /api/auth/get-pin` - Get current PIN
- `POST /api/auth/delete-account` - Permanently delete account
- `POST /api/auth/logout` - Logout user

#### Reports (6 endpoints)

- `POST /api/submitReport` - Submit encrypted report
- `GET /api/reportStatus` - Check report status (pending/confirmed/failed)
- `GET /api/report/{reportId}/decrypt` - Decrypt and view report
- `POST /api/report/{reportId}/archive` - Archive report (hide from library)
- `POST /api/report/{reportId}/unarchive` - Unarchive report
- `GET /api/health` - Health check (no auth required)

#### Access Control (6 endpoints)

- `POST /api/access/grant` - Grant another user access to report
- `POST /api/access/revoke` - Revoke user access
- `GET /api/access/shared-with-me` - Get reports shared with me
- `GET /api/access/my-shared-reports` - Get reports I shared with others
- `GET /api/access/my-report/{reportId}/viewers` - Get viewers of my report
- `GET /api/access/report/{reportId}` - View shared report

#### Panic Alerts (2 endpoints)

- `POST /api/panic-alert` - Send emergency panic alert (non-blocking, <100ms)
- `GET /api/panic-alert/history` - Get panic alert history

#### Emergency Contacts (6 endpoints)

- `POST /api/emergency/set-panic-message` - Set custom panic message
- `GET /api/emergency/panic-message` - Get current panic message
- `POST /api/emergency/add-contact` - Add emergency contact
- `GET /api/emergency/contacts` - Get all emergency contacts
- `PUT /api/emergency/edit-contact/{contactId}` - Edit contact details
- `DELETE /api/emergency/remove-contact/{contactId}` - Remove contact

#### Notifications (5 endpoints)

- `GET /api/notifications` - Get user notifications (with filtering)
- `GET /api/notifications/unread/count` - Get unread count
- `POST /api/notifications/{notificationId}/read` - Mark as read
- `POST /api/notifications/mark-all-read` - Mark all as read
- `DELETE /api/notifications/{notificationId}` - Delete notification

#### Key Recovery (2 endpoints)

- `POST /api/keys/backup` - Backup encryption key with PIN
- `POST /api/keys/recover` - Recover key using PIN and phone

#### Search (2 endpoints)

- `GET /api/search/reports` - Search/filter reports by status, date
- `GET /api/search/stats` - Get report statistics

### Authentication

All endpoints except signup, login, health check, and key recovery require JWT:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

JWT tokens expire in 7 days.

### Rate Limits

| Endpoint           | Limit            |
| ------------------ | ---------------- |
| `/auth/*/initiate` | 5 per 15 minutes |
| `/auth/*/verify`   | 5 per 15 minutes |
| `/panic-alert`     | 10 per minute    |
| `/keys/recover`    | 5 per 15 minutes |

### Example Requests

**Signup:**

```bash
curl -X POST http://localhost:3001/api/auth/signup/initiate \
  -H "Content-Type: application/json" \
  -d '{"phone": "0750902921"}'

# Then verify with OTP from Twilio:
curl -X POST http://localhost:3001/api/auth/signup/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "0750902921", "otp": "123456"}'
```

**Submit Report:**

```bash
curl -X POST http://localhost:3001/api/submitReport \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {"title": "Incident", "description": "..."},
    "responses": ["Yes", "Answer2", "Answer3", "Answer4", "Answer5"]
  }'
```

**Send Panic Alert:**

```bash
curl -X POST http://localhost:3001/api/panic-alert \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"locationData": "GPS coordinates or map link"}'
```

---

## Architecture

### System Overview

SafeGirl is a women's safety reporting platform with:

- **Phone-only authentication** (OTP-based, no passwords)
- **End-to-end encryption** (AES-256-GCM)
- **Immutable records** (IPFS + Polygon blockchain)
- **Non-blocking panic alerts** (instant response + async SMS)
- **Report access control** (database-enforced sharing)

### Tech Stack

| Component      | Technology                      |
| -------------- | ------------------------------- |
| **Server**     | Express.js + Node.js            |
| **Database**   | PostgreSQL                      |
| **Storage**    | IPFS (Pinata)                   |
| **Blockchain** | Polygon Amoy testnet + Solidity |
| **Encryption** | AES-256-GCM (Node.js crypto)    |
| **SMS**        | Twilio                          |
| **Email**      | Gmail SMTP                      |

### Authentication Flow

```
1. User enters phone (any format: 0750..., +256..., 256...)
2. Phone normalized to E.164 (+256750902921)
3. 6-digit OTP generated (5 min expiry, 3 attempts max)
4. Twilio SMS sent to user
5. User enters OTP
6. Account created + JWT returned (7 day expiry)
7. Optional: User adds email for account recovery
```

### Report Submission Pipeline

```
1. FRONTEND: User submits unencrypted {payload, responses, metadata}
2. BACKEND: Generates per-report encryption key (32 bytes)
3. BACKEND: AES-256-GCM encrypts report data
4. BACKEND: Uploads encrypted data to IPFS → returns hash
5. BACKEND: Submits userKey + IPFS hash to smart contract (`submitReportFor`) → returns txHash
6. DATABASE: Stores reportId, ipfsHash, txHash, encryptionKey (encrypted)
7. Status: "pending" → "confirmed" once blockchain confirms
```

### Encryption Design

- **Per-report key**: Each report gets unique 32-byte key
- **Master key**: Derived from PIN (if set) or app default
- **Key backup**: Frontend can recover key using PIN (stored as SHA-256 hash)
- **Storage**: All encryption keys encrypted before database storage

### Non-Blocking Panic Alert Flow

**User-facing response: <100ms**

```
1. User hits panic → alert inserted to DB immediately
2. Return 200 OK with alertId + status="pending"
3. Background processing (async, non-blocking):
   a. Save to DB
   b. SMS notifications to emergency contacts (rate-limited) and at the same time Blockchain confirmation (2-5 sec)
   c. Audit logging
4. If background fails, alert still exists in DB for recovery
```

### Access Control

- **Grant Access**: Instant DB insert (no blockchain wait)
- **Revoke Access**: Instant DB update (no blockchain wait)
- **View Report**: Check DB access table before decryption
- **Why DB-only**: Since we are using one wallet address(company address) we cant use access control on blockchain since it only understands wallert addreses not userids 

### Blockchain Integration

- **Smart Contract**: Polygon Amoy testnet
- **Company Wallet**: Single wallet signs all transactions (users pay no gas)
- **Functions Used**: `submitReportFor`, `getReportStatusFor`, `sendPanicAlert`
- **Functions Bypassed**: grantAccess, revokeAccess (DB-only for speed)
- **Verification**: `getReportStatusFor` verifies DB matches blockchain

---

## Backend Internals

### Backend Code Map

| Path                          | Responsibility                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `backend/server.js`           | Express app bootstrap, middleware registration, route mounting, service initialization, graceful shutdown |
| `backend/routes/`             | HTTP route definitions and middleware chains                                                              |
| `backend/controllers/`        | Orchestrates request-level business flows (report, auth, panic, access, notifications)                    |
| `backend/services/`           | External integrations and core logic (database, blockchain, IPFS, encryption, OTP, email)                 |
| `backend/middleware/`         | Cross-cutting controls (JWT auth, validation, rate limiting, error handling)                              |
| `backend/config/contracts.js` | Blockchain provider/signer/contract initialization and ABI wiring                                         |
| `backend/db/`                 | SQL schema and migrations                                                                                 |
| `backend/utils/logger.js`     | Structured logging used across all layers                                                                 |

### Startup Sequence (What Happens On Boot)

`backend/server.js` starts services in this order:

1. Initializes blockchain connection (`contractManager.initialize()`).
2. Initializes IPFS service.
3. Initializes database connection.
4. Initializes email service.
5. Starts confirmation scheduler (`confirmationScheduler.start()`) to reconcile pending report confirmations.
6. Mounts routes and starts HTTP listener.

If a dependency initializes with warnings, server startup still continues so the API remains available for partial functionality.

### Request Lifecycle: Submit Report

Example request: `POST /api/submitReport`

1. Route layer (`backend/routes/reports.js`) applies:

- `authMiddleware` (JWT verification)
- `multer` upload parser (`upload.single('audio')`)
- `validateSubmitReport`

2. Controller layer (`backend/controllers/reportController.js`) coordinates the workflow:

- Reads authenticated `userId` from `req.user`.
- Encrypts payload (`encryptionService`).
- Uploads encrypted bytes to IPFS (`ipfsService`).
- Submits on-chain record through company wallet (`blockchainService.submitReport` -> `submitReportFor`).
- Persists submission metadata in PostgreSQL (`databaseService.saveSubmission`).
- Creates notification entry for the user.

3. Response returns report metadata (`reportId`, `txHash`, `ipfsHash`, and timestamps).
4. Background reconciliation continues via scheduler to update confirmation-related status over time.

### Request Lifecycle: Panic Alert

Example request: `POST /api/panic-alert`

1. Route layer (`backend/routes/panic.js`) applies JWT auth and panic-specific rate limit (`10/min`).
2. Controller (`backend/controllers/panicController.js`) records the alert in DB immediately.
3. API returns quickly (non-blocking behavior).
4. Follow-up work (blockchain confirmation and notifications) proceeds asynchronously.

### Security Controls In Backend

- **Authentication**: `backend/middleware/auth.js` verifies JWT and injects `req.user`.
- **Input Validation**: `backend/middleware/validation.js` validates request payloads and expected formats.
- **Rate Limiting**: `backend/middleware/rateLimit.js` applies endpoint-specific request caps.
- **Error Handling**: `backend/middleware/errorHandler.js` normalizes error responses and maps common integration failures (IPFS/network/timeout).

### Data Ownership Model

- App identity is database/JWT-based (`userId`).
- On-chain identity for reports is pseudonymous `userKey = keccak256(String(userId))` (derived in `backend/services/blockchain.js`).
- This allows one company wallet to submit many user reports without wallet-per-user UX.

### Operational Notes

- Logs are written under `backend/logs/`.
- Confirmation scheduler polls pending submissions at a configurable interval and updates confirmation counts/status.
- Access control for viewing reports is currently DB-enforced for fast grant/revoke UX; contract consent events are not the runtime source of truth.

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────┐
│    users    │
│ ┌─────────┐ │
│ │ userId  │ │ (primary key)
│ │ phone   │ │ (unique, E.164)
│ │ email   │ │ (optional)
│ │ pin     │ │ (1-6 digits, plaintext)
│ └─────────┘ │
└─────────────┘
      ↓
┌──────────────────────┐
│   submissions        │
│ ┌──────────────────┐ │
│ │ reportId (UQ)    │ │
│ │ userId (FK)      │ │
│ │ ipfsHash         │ │
│ │ txHash           │ │
│ │ status (pending/ │ │
│ │  submitted/fail) │ │
│ │ encryptionKey*   │ │
│ └──────────────────┘ │
└──────────────────────┘
      ↓
┌──────────────────────┐
│  report_access       │
│ ┌──────────────────┐ │
│ │ reportId (FK)    │ │
│ │ reporterId (FK)  │ │
│ │ viewerId (FK)    │ │
│ │ isActive         │ │
│ └──────────────────┘ │
└──────────────────────┘
```

### Core Tables

#### `users` (User Accounts)

```
userId (UUID)          - Unique identifier
phone (VARCHAR 20)     - E.164 format (+256...)
email (VARCHAR 255)    - Optional recovery email
pin (VARCHAR 6)        - 1-6 digit content lock (plaintext)
phone_verified         - Boolean
email_verified         - Boolean
createdAt              - Account creation time
lastLogin              - Last login time
```

#### `submissions` (Report Records)

```
reportId (VARCHAR)     - Unique report ID
userId (FK)            - Report owner
ipfsHash (VARCHAR)     - IPFS hash of encrypted data
txHash (VARCHAR)       - Blockchain transaction hash (nullable)
blockNumber            - Blockchain block number
status                 - "pending" | "confirmed" | "failed"
encryptionKey          - Encrypted key (hex)
encryptionKeyIv        - Key encryption IV (hex)
encryptionKeyAuthTag   - Key auth tag (hex)
encryptionDataIv       - Data encryption IV (hex)
encryptionDataAuthTag  - Data auth tag (hex)
isArchived             - Boolean (soft-delete)
createdAt              - Submission time
submittedAt            - Blockchain confirmation time
```

#### `report_access` (Access Control)

```
reportId (FK)          - Report being shared
reporterId (FK)        - Report owner
viewerId (FK)          - User granted access
grantedAt              - Grant time
expiresAt              - Optional expiry
isActive               - Revocation flag
revokedAt              - Revocation time
```

#### `emergency_contacts` (Panic Alert Recipients)

```
userId (FK)            - Contact owner
phone (VARCHAR 20)     - Contact phone (E.164)
name (VARCHAR 255)     - Contact name
relationship           - "mother", "friend", "police", etc
isActive               - Boolean
createdAt              - Creation time
```

#### `panic_alerts` (Panic Records)

```
userId (FK)            - User who panicked
locationData           - GPS/map info
txHash (VARCHAR)       - Blockchain confirmation (nullable)
blockNumber            - Blockchain block
createdAt              - Alert time
```

#### `otps` (One-Time Passwords)

```
userId (FK)            - User (null for signup)
phone (VARCHAR 20)     - OTP sent to
otp_code (VARCHAR 6)   - 6-digit code
otp_type               - "signup" | "login" | "phone_change" | "recovery"
attempts               - Failed attempt count
max_attempts           - Max allowed (default 3)
is_used                - Mark used after verification
expires_at             - 5 minutes from creation
verified_at            - Verification time
```

#### `notifications` (User Notifications)

```
userId (FK)            - Recipient
type                   - "access_granted" | "panic_alert" | "report_submitted"
title (VARCHAR 255)    - Notification title
message (TEXT)         - Message
relatedId              - reportId or accessId
isRead                 - Boolean
createdAt              - Creation time
readAt                 - Read time
```

#### Additional Tables

- `recovery_tokens` - Email-based account recovery (24h expiry)
- `submission_audit_log` - Tracks all changes to submissions
- `panic_audit_log` - Tracks panic alert actions for audit trail
- `tampering_alerts` - Detects DB/blockchain mismatches

### Key Design Decisions

**Why txHash is nullable:**

- Non-blocking panic alerts: Alert inserted immediately, txHash added later
- Supports async blockchain confirmation

**Why PIN is plaintext:**

- Only for UI-level content lock, not authentication
- Frontend controls actual decryption
- PIN recovery via SHA-256 hash in `key_backups` table

**Why access control is DB-only:**

-Since we have one wallet address we cant use access control from the blockhain as it requires wallet addresses

**Why isArchived instead of deletion:**

- Preserve blockchain immutability
- User can unarchive if needed
- Audit trail intact

---

## Setup Guide

### Prerequisites

- **Node.js**: v22.10.0+ (required for Hardhat 3 contract tooling)
- **Docker**: Latest version
- **PostgreSQL**: v13+ (or via Docker)
- **npm**: v10+

### Hardhat Deploy Note (Required)

Before running any Hardhat deploy command, switch to Node `22.10.0` with `nvm`:

```bash
nvm install 22.10.0
nvm use 22.10.0
node -v
```

Then run deploy commands (example):

```bash
npm run compile
npm run deploy
```

### Environment Variables

Create `.env` in `backend/` directory also use .env.example to get the structure :

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=safegirl_db
DB_USER=safegirl_user
DB_PASSWORD=your_secure_password

# JWT
JWT_SECRET=<generate-with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
JWT_EXPIRY=604800

# Blockchain (Polygon Amoy)
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology/
PRIVATE_KEY=0x...your_private_key...
DEPLOYED_CONTRACT_ADDRESS=0x...deployed_contract_address...

# IPFS (Pinata)
PINATA_API_KEY=your_api_key
PINATA_API_SECRET=your_api_secret
PINATA_JWT=your_jwt_token

# SMS (Twilio)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+256...
PHONE_PREFIX=256
PHONE_PREFIX_LOCAL=0

# Email (Gmail SMTP)
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password

# Server
PORT=3001
NODE_ENV=development
LOG_LEVEL=debug
```

### Database Setup (with Docker)

```bash
# PostgreSQL starts automatically with docker compose
# But if setting up manually:

# Create database
createdb -U postgres safegirl_db

# Create user
createuser -U postgres safegirl_user
psql -U postgres -c "ALTER USER safegirl_user WITH PASSWORD 'your_password';"

# Grant permissions
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE safegirl_db TO safegirl_user;"

# Run initial schema
psql -U safegirl_user -d safegirl_db -f backend/db/init.sql

# Run migrations (in order)
psql -U safegirl_user -d safegirl_db -f backend/db/migrations/add_pin_column.sql
psql -U safegirl_user -d safegirl_db -f backend/db/migrations/add_emergency_contacts.sql
psql -U safegirl_user -d safegirl_db -f backend/db/migrations/add_panic_audit_log.sql
psql -U safegirl_user -d safegirl_db -f backend/db/migrations/add_notifications_table.sql
psql -U safegirl_user -d safegirl_db -f backend/db/migrations/add_pin_and_custom_panic_message.sql
psql -U safegirl_user -d safegirl_db -f backend/db/migrations/add_userid_to_submissions.sql
psql -U safegirl_user -d safegirl_db -f backend/db/migrations/remove_walletaddress_column.sql
```

### Running the Server

```bash
# Development mode (with auto-reload)
cd backend
npm run dev

# Production mode
npm start

# Running tests
npm test

```

### Deployment Checklist

**Environment Hardening**

- [ ] Generate new JWT_SECRET with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- [ ] Use strong database password (30+ chars)
- [ ] Set NODE_ENV=production
- [ ] Restrict CORS to your domain
- [ ] Use production blockchain RPC (Infura/Alchemy)
- [ ] Store private key in HSM or key management service

**Database**

- [ ] Enable SSL connections
- [ ] Set up automated backups (daily)
- [ ] Restrict database access by IP
- [ ] Enable query logging for audit

**Monitoring**

- [ ] Set up error logging (Sentry, LogRocket)
- [ ] Monitor request latency (p50, p95, p99)
- [ ] Track error rates
- [ ] Alert on failed blockchain transactions

**Security**

- [ ] HTTPS only (TLS 1.3)
- [ ] Implement rate limiting (already in code)
- [ ] Set up DDoS protection
- [ ] Configure WAF rules
- [ ] Verify smart contract audit

### Troubleshooting

**Database Connection Issues:**

```bash
# Test PostgreSQL
psql -U safegirl_user -d safegirl_db -c "SELECT 1"

# Check if running
docker ps | grep postgres

# View logs
docker logs safegirl-postgres
```

**Blockchain Connection Issues (local node mode):**

```bash
# Verify local Hardhat node is running
curl http://localhost:8545

# Get block number
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

**OTP Not Received:**

- Verify phone format (10-15 digits only)
- Check Twilio account has SMS capability
- Verify TWILIO_PHONE_NUMBER is set
- Check rate limits (5 per 15 minutes)

**IPFS Upload Failures:**

- Verify Pinata API keys
- Check PINATA_JWT token
- Verify network connectivity
- Check timeout settings

---

## Smart Contract

### Overview

The SafeGirl smart contract is deployed on Polygon Amoy testnet and provides immutable logging of reports and alerts.

**Address**: Set via `DEPLOYED_CONTRACT_ADDRESS` in environment.

### Core Functions

#### `submitReportFor(bytes32 _userKey, string _ipfsHash, string[] _responses)`

Submits encrypted report with survey responses on behalf of an app user key.

- **Gas**: ~50,000
- **Event**: `ReportSubmittedFor(bytes32 indexed userKey, address indexed submitter, uint256 timestamp, string ipfsHash, uint256 version)`

#### `submitReport(string _ipfsHash, string[] _responses)`

Direct wallet-native submission path (address-based ownership).

#### `sendPanicAlert(string _locationData)`

Logs panic alert to blockchain.

- **Gas**: ~30,000
- **Event**: `PanicAlert(address indexed sender, uint256 timestamp, string locationData)`

#### `grantAccess(address _viewer, uint256 _customExpiry)`

Grants viewing access (stored on-chain, not enforced).

- **Gas**: ~40,000
- **Event**: `ConsentGranted(address indexed reporter, address indexed viewer, uint256 expiresAt)`

#### `revokeAccess(address _viewer)`

Revokes viewing access (stored on-chain, not enforced).

- **Gas**: ~30,000
- **Event**: `ConsentRevoked(address indexed reporter, address indexed viewer)`

### View Functions

- `getReportStatusFor(bytes32 _userKey)` → (bool exists, uint256 timestamp, string ipfsHash, uint256 version)
- `getReportStatus(address _user)` → (bool exists, uint256 timestamp, string ipfsHash, uint256 version)
- `getActiveConsents(address _user)` → Consent[] memory
- `getQuestions()` → string[] memory
- `getTotalReports()` → uint256
- `getQuestionsCount()` → uint256

### Predefined Questions

1. "Do you feel safe right now?"
2. "Would you like to share what happened?"
3. "When did the incident happen?"
4. "Do you want to record this for personal tracking, or to share it later?"
5. "Do you need urgent medical care, shelter, or support?"

### Features

- ✅ Predefined trauma-informed questions
- ✅ Encrypted report storage (via IPFS)
- ✅ Immutable on-chain logging
- ✅ Consent/access management
- ✅ Panic alert logging
- ✅ No raw app user IDs stored on-chain (uses hashed `userKey`)
- ✅ Gas-optimized operations

### Data Safety Note

- Keep sensitive narrative content encrypted in IPFS payloads.
- Avoid placing personally identifying details in on-chain `responses` fields, because on-chain data is public and immutable.

### License

MIT

### Authors

- Blockchain: [BioKeyPer]
- UX/Trauma Design: [Courtney Price]
- Community Partner: [Akiiki Labs]

---


