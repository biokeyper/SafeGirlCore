# SafeGirl Backend Architecture

## System Overview

SafeGirl is a women's safety reporting platform designed for secure, encrypted report submission with blockchain verification and emergency alert capabilities. The system prioritizes user safety through:

- **Phone-only authentication** (no passwords, OTP-based)
- **End-to-end encryption** (AES-256-GCM with per-report keys)
- **Immutable records** (IPFS + Polygon blockchain)
- **Non-blocking panic alerts** (instant response + async SMS notifications)
- **Report access control** (database-enforced sharing)

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Server** | Express.js + Node.js | REST API backend |
| **Database** | PostgreSQL | User data, reports, access control, notifications |
| **Storage** | IPFS (Pinata) | Distributed encrypted report storage |
| **Blockchain** | Polygon (Mumbai testnet) | Immutable report records, event log |
| **Encryption** | crypto (Node.js) | AES-256-GCM for report data |
| **SMS** | Twilio | Emergency contact notifications |
| **Email** | Gmail SMTP | Account recovery |
| **Smart Contract** | Solidity (OpenZeppelin) | Report submission, access grants, panic alerts |

## Authentication Architecture

### Flow Diagram: Phone-Only OTP

```
User Signup:
┌─────────────────────────────────────────────────┐
│ 1. User enters phone (any format: 0750... +256...)
├─────────────────────────────────────────────────┤
│    → Phone normalized to E.164 (+256750902921)
│    → OTP generated (6 digits, 5-min expiry)
│    → Stored in `otps` table with attempt counter
├─────────────────────────────────────────────────┤
│ 2. User receives SMS via Twilio
├─────────────────────────────────────────────────┤
│ 3. User enters OTP
│    → Validated (6 digits, not expired, <3 attempts)
│    → Account created in `users` table
│    → JWT generated with userId, phone, email (if set)
│    → OTP marked as used
├─────────────────────────────────────────────────┤
│ 4. Frontend receives: { userId, token, pin }
│    → Token expires in 7 days
│    → PIN returned null if not set (for content lock)
└─────────────────────────────────────────────────┘

Login Flow:
┌─────────────────────────────────────────────────┐
│ 1. User enters phone
├─────────────────────────────────────────────────┤
│ 2. System finds user, generates new OTP
│    → SMS sent, `lastLogin` updated after verification
├─────────────────────────────────────────────────┤
│ 3. User enters OTP → JWT returned
└─────────────────────────────────────────────────┘

Phone Recovery (via Email):
┌─────────────────────────────────────────────────┐
│ 1. User provides email → Recovery token generated
│    → 24-hour expiry, stored in `recovery_tokens`
│    → Email sent to user
├─────────────────────────────────────────────────┤
│ 2. User clicks email link, provides new phone
│    → OTP sent to new phone
├─────────────────────────────────────────────────┤
│ 3. User verifies OTP → Phone updated, JWT returned
└─────────────────────────────────────────────────┘
```

### JWT Token Structure

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "phone": "+256750902921",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234654290  // 7 days later
}
```

### Key Design Decisions

- **No passwords**: OTP-based to reduce credential leakage risk
- **Phone as primary**: Aligns with African mobile-first context
- **Email optional**: Added post-signup for account recovery only
- **7-day JWT expiry**: Balance between security and user friction
- **PIN for content lock**: Separate from authentication (UI-level only)

---

## Report Submission Pipeline

### End-to-End Encryption Flow

```
1. FRONTEND: Generate Report Data
   ┌──────────────────────────────────────────┐
   │ User submits: {                          │
   │   payload: {...incident details...},     │
   │   responses: ["answer1", "answer2"...],  │
   │   metadata: {category, severity}         │
   │ }                                        │
   └──────────────────────────────────────────┘

2. FRONTEND → BACKEND: Sends UNENCRYPTED JSON
   (HTTPS/TLS protects in transit)

3. BACKEND: Encrypt Report
   ┌──────────────────────────────────────────┐
   │ a. Generate per-report key (32 bytes)    │
   │ b. AES-256-GCM encrypt {payload, res...}│
   │    - IV: 12 random bytes                 │
   │    - AuthTag: 16 bytes from GCM          │
   │    - Output: ciphertext (hex)            │
   │                                          │
   │ c. Encrypt key with master key           │
   │    - Uses PIN if available, or master    │
   │    - Store: encryptedKey, keyIv, authTag│
   └──────────────────────────────────────────┘

4. BACKEND: Upload to IPFS
   ┌──────────────────────────────────────────┐
   │ a. Create JSON: {                        │
   │      data: "encrypted_hex",              │
   │      dataIv: "iv_hex",                   │
   │      dataAuthTag: "auth_hex",            │
   │      key: "encrypted_key_hex",           │
   │      keyIv: "key_iv_hex",                │
   │      keyAuthTag: "key_auth_hex"          │
   │    }                                     │
   │ b. POST to Pinata → IPFS hash returned  │
   │ c. Store IPFS hash in database           │
   └──────────────────────────────────────────┘

5. BACKEND: Submit to Blockchain
   ┌──────────────────────────────────────────┐
   │ a. Call SmartContract.submitReport() with:│
   │    - ipfsHash                            │
   │    - responses[] (plaintext on-chain)    │
   │ b. Transaction mined, txHash received    │
   │ c. Store txHash in database              │
   │    status → "confirmed"                  │
   └──────────────────────────────────────────┘

6. DATABASE: Final Record
   ┌──────────────────────────────────────────┐
   │ submissions table:                       │
   │ {                                        │
   │   reportId,                              │
   │   userId,                                │
   │   ipfsHash,                              │
   │   txHash,                                │
   │   status: "confirmed",                   │
   │   encryptionKey (encrypted with PIN),    │
   │   encryptionKeyIv,                       │
   │   encryptionKeyAuthTag,                  │
   │   encryptionDataIv,                      │
   │   encryptionDataAuthTag,                 │
   │   createdAt,                             │
   │   confirmedAt                            │
   │ }                                        │
   └──────────────────────────────────────────┘
```

### Encryption Design Details

**Per-Report Key System:**
- Each report gets a unique 32-byte encryption key
- Key is encrypted with master key (derived from PIN or app default)
- If user sets PIN: `masterKey = PBKDF2(PIN, userId, iterations)`
- Else: `masterKey = appDefaultMasterKey`

**Why This Approach:**
- Lost PIN recovery: Users can recover key using PIN hash stored in `key_backups`
- Offline decryption: Frontend can decrypt with key (if available locally)
- No single point of failure: Deleting master key doesn't destroy reports

---

## Report Status Lifecycle

```
Database Status Values:
┌─────────────┬──────────────────────────────────┐
│ pending     │ Report received, awaiting IPFS   │
│             │ upload and blockchain submission  │
├─────────────┼──────────────────────────────────┤
│ confirmed   │ IPFS + blockchain confirmed      │
│             │ Report is immutable              │
├─────────────┼──────────────────────────────────┤
│ failed      │ Blockchain submission failed     │
│             │ Manual retry/admin intervention  │
│             │ (IPFS data preserved)            │
└─────────────┴──────────────────────────────────┘

Blockchain Verification:
┌──────────────────────────────────────────────┐
│ GET /api/reportStatus called:                │
│                                              │
│ 1. Fetch from DB (reportId, txHash, status)  │
│ 2. If txHash exists:                         │
│    - Call blockchain.getTransaction(txHash) │
│    - Verify:                                 │
│      a. Block is mined (blockNumber != null)│
│      b. Transaction successful (receipt.ok) │
│      c. Event emitted (ReportSubmitted)      │
│    - If any check fails → log tampering     │
│    - Update DB status to confirmed/failed    │
│ 3. Return status + blockchain metadata      │
└──────────────────────────────────────────────┘
```

---

## Non-Blocking Panic Alert Flow

### Design Goal: Instant Response (<100ms)

```
STEP 1: Instant Response (<100ms)
┌──────────────────────────────────────────────┐
│ User hits panic button                       │
├──────────────────────────────────────────────┤
│ Backend:                                     │
│ 1. Insert panic_alerts row (userId, location)│
│ 2. Return alertId + status="pending" (200 OK)│
│ 3. Return immediately (<100ms)               │
└──────────────────────────────────────────────┘

STEP 2: Background Processing (Async)
┌──────────────────────────────────────────────┐
│ Non-blocking workers process in parallel:    │
│                                              │
│ a. BLOCKCHAIN (2-5 sec):                    │
│    - Call contract.sendPanicAlert(location) │
│    - Store txHash in panic_alerts.txHash     │
│    - Log to panic_audit_log                  │
│                                              │
│ b. SMS NOTIFICATIONS (rate-limited):        │
│    - Fetch emergency_contacts (isActive)     │
│    - Fetch customPanicMessage from users     │
│    - For each contact:                       │
│      a. Send SMS via Twilio                  │
│      b. Construct: customMsg + map link      │
│      c. Log status to panic_audit_log        │
│      d. Rate limit: 1 SMS/sec                │
│                                              │
│ c. NOTIFICATION (instant):                  │
│    - Create notifications entry              │
│      type="panic_alert", userId=requester    │
│    - No user wait time                       │
│                                              │
│ All failures are logged but non-fatal        │
└──────────────────────────────────────────────┘

Alert Always Exists in DB:
┌──────────────────────────────────────────────┐
│ Even if background fails:                    │
│ - alertId exists in DB (for recovery)        │
│ - User can query history                     │
│ - Admin can retry failed SMS sends           │
└──────────────────────────────────────────────┘
```

### Why Non-Blocking?

- **User doesn't wait**: Returns immediately regardless of SMS or blockchain success
- **Safe to fail**: If SMS fails, alert still exists in system
- **Audit trail**: `panic_audit_log` tracks all actions and failures
- **Rate limiting**: SMS sent at ~1/sec to avoid SMS provider rate limits

---

## Access Control Architecture

### Database-Only Access (Blockchain Bypassed)

**Why not use blockchain grants?**
- Blockchain is slow (2-5 sec per revoke transaction)
- Access control is frequent (immediate user expectations)
- Database provides instant revocation
- Blockchain audit trail kept for security investigation

```
GRANT ACCESS:
┌──────────────────────────────────────────┐
│ POST /api/access/grant                   │
│ {                                        │
│   reportId: "abc-def",                   │
│   viewerUserId: "viewer-123",            │
│   expiresAt: "2026-03-15T00:00:00Z"      │
│ }                                        │
├──────────────────────────────────────────┤
│ Backend:                                 │
│ 1. Verify user owns report               │
│ 2. Insert report_access row:             │
│    {                                     │
│      reportId, reporterId, viewerId,     │
│      grantedAt, expiresAt, isActive      │
│    }                                     │
│ 3. Create notification for viewer        │
│ 4. Return accessId (200 OK)              │
└──────────────────────────────────────────┘

REVOKE ACCESS:
┌──────────────────────────────────────────┐
│ POST /api/access/revoke                  │
│ {                                        │
│   reportId, viewerUserId                 │
│ }                                        │
├──────────────────────────────────────────┤
│ Backend:                                 │
│ 1. Verify user owns report               │
│ 2. Update report_access:                 │
│    SET isActive=FALSE, revokedAt=NOW()   │
│ 3. Return 200 OK (instant)               │
└──────────────────────────────────────────┘

VIEW SHARED REPORT:
┌──────────────────────────────────────────┐
│ GET /api/access/report/:reportId         │
├──────────────────────────────────────────┤
│ Backend:                                 │
│ 1. Check report_access table:            │
│    - isActive=TRUE                       │
│    - (expiresAt IS NULL OR > NOW())      │
│ 2. If match found → decrypt & return    │
│ 3. Else → 403 Forbidden                  │
└──────────────────────────────────────────┘
```

### Access Grant Table

```sql
CREATE TABLE report_access (
  id SERIAL PRIMARY KEY,
  reportId VARCHAR(255) NOT NULL,
  reporterId VARCHAR(255) NOT NULL,    -- Owner
  viewerId VARCHAR(255) NOT NULL,      -- Granted user
  grantedAt TIMESTAMP DEFAULT NOW(),
  expiresAt TIMESTAMP NULL,             -- Optional
  isActive BOOLEAN DEFAULT TRUE,        -- For revocation
  revokedAt TIMESTAMP NULL,

  UNIQUE(reportId, reporterId, viewerId)
);
```

---

## Blockchain Integration

### Smart Contract Functions Used

| Function | When Called | Async? |
|----------|-------------|--------|
| `submitReport(ipfsHash, responses[])` | Report submission | Yes (async processing) |
| `updateReport(ipfsHash, responses[])` | Report edit | Not implemented yet |
| `sendPanicAlert(locationData)` | Panic button | Yes (background) |
| `setEmergencyContact(address, type)` | Admin setup | Not called from backend |
| `grantAccess(viewer, expiry)` | **Bypassed** (DB only) | N/A |
| `revokeAccess(viewer)` | **Bypassed** (DB only) | N/A |

### Company Wallet Pattern

All transactions signed with **single company wallet** (not user wallets):

```
Why?
┌─────────────────────────────────────────┐
│ • User cost: Free (company absorbs gas)  │
│ • Simplifies user experience             │
│ • No wallet setup required               │
│ • Easier to track/audit (single actor)   │
└─────────────────────────────────────────┘

Private Key Management:
┌─────────────────────────────────────────┐
│ 1. Stored in environment: WEB3_PRIVATE_KEY
│ 2. Never logged or exposed              │
│ 3. Loaded at server startup             │
│ 4. Signer attached to ethers.js         │
└─────────────────────────────────────────┘

Gas Estimation:
┌─────────────────────────────────────────┐
│ 1. Estimate gas before sending           │
│ 2. Add 20% buffer for safety             │
│ 3. Use network's current gasPrice        │
│ 4. Submit transaction with gas limit     │
└─────────────────────────────────────────┘
```

### Verification Resilience

```
Blockchain Submission Failures:
┌─────────────────────────────────────────┐
│ If txHash rejected/reverted:            │
│                                         │
│ 1. Retry up to 3 times with backoff    │
│ 2. If all fail:                        │
│    - Report status = "failed"           │
│    - IPFS data preserved (no loss)      │
│    - Manual admin retry available       │
│                                         │
│ 3. getReportStatus() verifies:         │
│    - txHash is in blockchain           │
│    - Block is mined                     │
│    - If mismatch detected → audit log  │
└─────────────────────────────────────────┘
```

---

## Services Architecture

### Database Service (`services/database.js`)

```
Responsibilities:
├─ PostgreSQL connection pooling
├─ Table initialization
├─ User CRUD operations
├─ Report queries (with decryption support)
├─ Access control checks
├─ Notification management
└─ Panic alert logging
```

### Blockchain Service (`services/blockchain.js`)

```
Responsibilities:
├─ Contract instance management
├─ Transaction submission (submitReport, sendPanicAlert)
├─ Transaction verification (status checks)
├─ Gas estimation
├─ Blockchain event parsing
└─ Error recovery & retries
```

### IPFS Service (`services/ipfs.js`)

```
Responsibilities:
├─ Pinata API integration
├─ File upload (encrypted reports)
├─ Hash retrieval & verification
├─ Timeout handling
└─ Fallback mechanisms
```

### Email Service (`services/email.js`)

```
Responsibilities:
├─ Gmail SMTP connection
├─ OTP email (recovery tokens)
├─ Account recovery emails
├─ SMS via Twilio (emergency alerts)
└─ Delivery retry logic
```

### Encryption Service (`services/encryption.js`)

```
Responsibilities:
├─ AES-256-GCM encryption/decryption
├─ Key generation (per-report)
├─ Master key derivation (from PIN)
├─ Key encryption (backup & recovery)
└─ IV/AuthTag management
```

### Event Listener (`services/eventListener.js`)

```
Status: DISABLED (using DB logging instead)

Historical Purpose:
├─ Monitored blockchain for ReportSubmitted events
├─ Used for real-time status updates
└─ Replaced by periodic database polling
```

---

## Background Verification System

### How getReportStatus Detects Tampering

```
When called:
┌──────────────────────────────────────────┐
│ GET /api/reportStatus?reportId=abc       │
├──────────────────────────────────────────┤
│ 1. Fetch from submissions table:         │
│    - ipfsHash, txHash, status, blockNum  │
│                                          │
│ 2. If txHash in blockchain:              │
│    - Fetch from blockchain:              │
│      a. Transaction status (success/fail)│
│      b. Block number (immutability proof)│
│      c. Gas used                         │
│                                          │
│ 3. Compare DB vs Blockchain:             │
│    ✗ If mismatch detected:               │
│      - Create tampering_alerts row       │
│      - Log to submission_audit_log       │
│      - Alert admin for investigation     │
│    ✓ If match confirmed:                 │
│      - Update DB status to "confirmed"   │
│      - Return metadata                   │
└──────────────────────────────────────────┘
```

### Tables Used

```sql
-- Tracks field changes
submission_audit_log:
  reportId, fieldChanged, oldValue, newValue,
  changeReason, changedBy, changedAt

-- Detects tampering
tampering_alerts:
  reportId, dbValue, blockchainValue,
  correctionApplied, detectedAt
```

---

## Error Handling & Resilience

### Graceful Degradation

```
Service Failures:
┌────────────────┬───────────────────┬──────────────┐
│ Service        │ Impact            │ Mitigation   │
├────────────────┼───────────────────┼──────────────┤
│ Blockchain     │ Reports stay      │ Retry in     │
│ down           │ "pending"         │ background   │
├────────────────┼───────────────────┼──────────────┤
│ IPFS/Pinata    │ Upload fails      │ Store locally│
│ timeout        │                   │ Retry later  │
├────────────────┼───────────────────┼──────────────┤
│ Twilio SMS     │ Panic SMS fails   │ Log failure  │
│ down           │ (alert still in DB)│ for audit    │
├────────────────┼───────────────────┼──────────────┤
│ Email service  │ Recovery fails    │ Retry with   │
│ down           │ (OTP still sent)  │ user retries │
└────────────────┴───────────────────┴──────────────┘
```

### Rate Limiting

```
Endpoint              | Limit           | Purpose
──────────────────────┼─────────────────┼──────────────────
/auth/*/initiate      | 5 / 15 min      | Prevent OTP spam
/auth/*/verify        | 5 / 15 min      | Prevent brute force
/panic-alert          | 10 / min        | Allow emergency spam
/keys/recover         | 5 / 15 min      | Prevent PIN brute force
All others            | No global limit | Per-session tracking
```

---

## Data Flow Diagrams

### Complete Report Submission Flow

```
Client                  Backend              Blockchain         IPFS             Database
   │                       │                     │                 │                │
   ├─ POST /submitReport ──>│                     │                 │                │
   │   {payload, ...}       │                     │                 │                │
   │                        ├─ Encrypt payload   │                 │                │
   │                        ├─ Upload to IPFS   │                 │                │
   │                        │<────────────────── IPFS hash         │                │
   │                        ├─ Submit to contract                 │                │
   │                        │──────────────────>│                 │                │
   │                        │                     ├─ Emit event    │                │
   │<─ 200: {reportId, txHash} ────│<─────────── txHash ──────────┤                │
   │   status=pending       │                     │                 │                │
   │                        │                     │                 │ ← INSERT      │
   │                        │─────────────────────────────────────→ submissions     │
   │                        │                                        │                │
   │ [polling]              │                                        │                │
   ├─ GET /reportStatus ───>│                                        │                │
   │                        ├─ Verify txHash on blockchain          │                │
   │                        │                     ← GET receipt      │                │
   │<─ {status: confirmed,  │<───────── confirmed ────────────────┤ ← UPDATE       │
   │    blockNumber: 123}   │                                        │ status="confirmed"
```

---

## Security Considerations

### Encryption at Rest

- Report data encrypted before IPFS upload (AES-256-GCM)
- Keys encrypted with master key derived from PIN (optional) or app secret
- Database stores only encrypted keys, not plaintext

### Encryption in Transit

- All API requests over HTTPS/TLS
- JWT tokens signed with HS256 (HMAC-SHA256)
- Blockchain communication via secure RPC endpoints

### Access Control

- JWT required for all protected endpoints
- User ID from token used to verify ownership/access
- Database-level access checks (no relying on client-side filtering)

### Rate Limiting

- Per-phone OTP rate limits (5/15min)
- Panic alert rate limits (10/min) to allow emergency spam
- Key recovery rate limits (5/15min) for PIN brute force protection

---

## Deployment Topology

### Local Development

```
Frontend (localhost:3000)
    │
    └─→ Backend API (localhost:3001)
            │
            ├─→ PostgreSQL (localhost:5432)
            ├─→ Hardhat Local Node (localhost:8545)
            ├─→ Pinata IPFS (https://api.pinata.cloud)
            └─→ Twilio SMS API
```

### Production (Recommended)

```
CDN (Static Frontend)
    │
    └─→ Load Balancer
            │
            └─→ Backend Cluster (multiple instances)
                    │
                    ├─→ RDS PostgreSQL (replicated)
                    ├─→ Polygon Mumbai RPC (Infura/Alchemy)
                    ├─→ Pinata IPFS
                    └─→ Twilio SMS
```

---

## Monitoring & Logging

### Log Levels

```
debug    - Request details, gas estimates
info     - Transaction confirmations, user actions
warn     - Retry attempts, service degradation
error    - Failed transactions, encryption errors
```

### Key Metrics

- OTP success rate
- Report submission status distribution (pending/confirmed/failed)
- Panic alert SMS delivery rate
- Blockchain transaction confirmation time
- IPFS upload latency
- Database query performance

### Alerting

Monitor for:
- Blockchain network issues (failed submissions)
- IPFS service unavailability
- SMS delivery failures
- Database connection pool exhaustion
- Unusual rate limit triggers
- Tampering alert triggers
