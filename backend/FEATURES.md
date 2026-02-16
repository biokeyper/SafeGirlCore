# SafeGirl Backend - Features Summary

## Completed Implementation

### 1. **Backend Encryption** ✅
- **encryptionService.js** - AES-256-GCM authenticated encryption
- Frontend sends unencrypted JSON
- Backend encrypts before IPFS upload
- Encryption keys stored in database (encrypted with master key)
- Users can decrypt reports using stored keys

**Endpoints Affected:**
- `POST /api/submitReport` - Now accepts JSON payload
- `GET /api/report/:reportId/decrypt` - NEW: Decrypt and view report (protected)

---

### 2. **Report Access/Sharing** ✅
- Grant access to specific users
- Revoke access anytime
- Share encrypted reports with authorized viewers
- Access tracking in database
- Blockchain consent management

**New Endpoints:**
- `POST /api/access/grant` - Grant access to a report
- `POST /api/access/revoke` - Revoke access from a report
- `GET /api/access/shared-with-me` - Get reports shared with me
- `GET /api/access/my-report/:reportId/viewers` - Get viewers of my report
- `GET /api/access/report/:reportId` - View a shared/owned report

---

### 3. **Rate Limiting** ✅
- **rateLimit.js** - In-memory rate limiting middleware
- Prevents brute force attacks on sensitive endpoints
- Tracks by IP + endpoint + phone/email
- Returns 429 status with retry-after header

**Protected Endpoints:**
- Auth signup/login: 5 attempts per 15 minutes per phone
- Key recovery: 5 attempts per 15 minutes per phone
- Panic alert: 10 attempts per minute (emergency safety)

---

### 4. **Panic Alert System** ✅
- Emergency panic alert for users in danger
- Location data recorded and sent to blockchain
- PanicAlert event emitted on-chain
- Alert history available

**New Endpoints:**
- `POST /api/panic-alert` - Send emergency panic alert (rate limited)
- `GET /api/panic-alert/history` - Get panic alert history

**Database:**
- `panic_alerts` table - Stores location, txHash, timestamps
- Indexed by userId and createdAt

---

### 5. **Key Recovery System** ✅
- Backup encryption key with 4-6 digit PIN
- Recover key if phone lost/stolen
- PIN-based encryption (SHA-256 key derivation)
- Recovery attempt tracking (max 3 per hour)
- Secure storage in database

**New Endpoints:**
- `POST /api/keys/backup` - Backup encryption key with PIN (protected)
- `POST /api/keys/recover` - Recover key using PIN + phone (rate limited)

**Database:**
- `key_backups` table - Stores encrypted key, PIN hash, recovery attempts

---

### 6. **Testing Suite** ✅
- **Jest** configured with coverage reporting
- **4 test files** with comprehensive coverage

**Test Files:**
- `encryption.test.js` - 9 tests for AES-256-GCM encryption
- `rateLimit.test.js` - 7 tests for rate limiting
- `validation.test.js` - 15 tests for input validation
- `keyRecovery.test.js` - 12 tests for key recovery

**Run Tests:**
```bash
npm test              # Run all tests
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

---

## Updated Components

### Controllers
- **reportController.js** - Updated to use backend encryption
- **accessController.js** - NEW: Manage report sharing
- **panicController.js** - NEW: Handle panic alerts
- **keyRecoveryController.js** - NEW: Key backup/recovery

### Routes
- **routes/reports.js** - Added decrypt endpoint + auth middleware
- **routes/auth.js** - Added rate limiting
- **routes/access.js** - NEW: Report sharing endpoints
- **routes/panic.js** - NEW: Panic alert endpoints
- **routes/keys.js** - NEW: Key recovery endpoints

### Middleware
- **rateLimit.js** - NEW: Rate limiting middleware
- **auth.js** - JWT token verification (existing)
- **validation.js** - Updated for JSON payload validation

### Services
- **encryption.js** - NEW: AES-256-GCM encryption
- **blockchain.js** - Added `sendPanicAlert()` and `revokeAccess()`
- **database.js** - Added methods for:
  - Access management (grant, revoke, check)
  - Panic alerts (save, get history)
  - Key backups (save, get, track attempts)

### Configuration
- **contracts.js** - Added `sendPanicAlert` to ABI

### Database
- **init.sql** - NEW tables:
  - `panic_alerts` - Emergency alert tracking
  - `key_backups` - Encrypted key storage
  - `report_access` - Report sharing permissions

### Config Files
- **jest.config.js** - NEW: Test configuration
- **package.json** - Added test scripts and dependencies
- **TESTING.md** - NEW: Testing guide
- **FEATURES.md** - NEW: This file

---

## Security Features

### Encryption
- ✅ AES-256-GCM with authenticated encryption
- ✅ Random IV and key per report
- ✅ Master key for key encryption
- ✅ Secure key storage (encrypted in database)

### Access Control
- ✅ JWT token authentication
- ✅ Role-based access (report owner only)
- ✅ Blockchain-verified consent grants
- ✅ Expiry timestamps on access grants

### Rate Limiting
- ✅ Brute force protection on auth
- ✅ OTP spam prevention
- ✅ Recovery attempt limits (3/hour)
- ✅ Per-IP, per-phone tracking

### Audit Trail
- ✅ Database audit logging (existing)
- ✅ Tampering detection (existing)
- ✅ Panic alert history
- ✅ Key recovery attempt tracking

---

## API Endpoints Summary

### Authentication (Existing)
```
POST   /api/auth/signup/initiate          - Start signup
POST   /api/auth/signup/verify            - Verify OTP
POST   /api/auth/login/initiate           - Start login
POST   /api/auth/login/verify             - Verify OTP
POST   /api/auth/forgot-phone             - Start recovery
POST   /api/auth/verify-recovery          - Verify recovery
POST   /api/auth/change-phone             - Change phone (auth)
POST   /api/auth/verify-phone-change      - Verify phone change
GET    /api/auth/verify                   - Check token valid
```

### Reports
```
POST   /api/submitReport                  - Submit encrypted report
GET    /api/reportStatus                  - Check report status
POST   /api/report/:reportId/archive      - Archive report
GET    /api/report/:reportId/decrypt      - Decrypt and view (protected)
GET    /api/health                        - Health check
```

### Access/Sharing
```
POST   /api/access/grant                  - Grant access to report
POST   /api/access/revoke                 - Revoke access
GET    /api/access/shared-with-me         - Get reports shared with me
GET    /api/access/my-report/:reportId/viewers - Get viewers
GET    /api/access/report/:reportId       - View shared/owned report
```

### Panic Alerts
```
POST   /api/panic-alert                   - Send panic alert (rate limited)
GET    /api/panic-alert/history           - Get panic history
```

### Key Recovery
```
POST   /api/keys/backup                   - Backup key with PIN (protected)
POST   /api/keys/recover                  - Recover key with PIN (rate limited)
```

### Search & Filtering
```
GET    /api/search/reports                - Search/filter reports
GET    /api/search/stats                  - Get report statistics
```

### Notifications
```
GET    /api/notifications                 - Get notifications
GET    /api/notifications/unread/count    - Get unread count
POST   /api/notifications/:id/read        - Mark as read
POST   /api/notifications/mark-all-read   - Mark all as read
DELETE /api/notifications/:id             - Delete notification
```

---

## Data Flow

### Report Submission
```
Frontend → (unencrypted JSON)
  ↓
Backend Validation
  ↓
Backend Encryption (AES-256-GCM)
  ↓
IPFS Upload (encrypted data)
  ↓
Blockchain Submission (IPFS hash)
  ↓
Database Save (encryption keys)
  ↓
Response to Frontend (reportId, txHash, ipfsHash)
```

### Report Decryption
```
User Request (with JWT)
  ↓
Authorization Check (owner or has access)
  ↓
Retrieve Encrypted Key from Database
  ↓
Decrypt Key with Master Key
  ↓
Fetch Encrypted Data from IPFS
  ↓
Decrypt Data with Report Key
  ↓
Return Decrypted Payload
```

### Key Recovery
```
User Request (phone + PIN)
  ↓
Lookup User by Phone
  ↓
Get Key Backup from Database
  ↓
Verify PIN Hash
  ↓
Check Recovery Attempts (max 3/hour)
  ↓
Decrypt Key with PIN
  ↓
Return Report Key to User
```

---

## Environment Variables

Required in `.env`:

```env
# Blockchain
DEPLOYED_CONTRACT_ADDRESS=0x...
PRIVATE_KEY=0x...
POLYGON_AMOY_RPC_URL=https://...

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# IPFS
WEB3_STORAGE_TOKEN=...

# JWT
JWT_SECRET=your-secret-key

# Encryption
ENCRYPTION_MASTER_KEY=hex-encoded-32-byte-key

# Email/SMS
SENDGRID_API_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
```

---

## Next Steps (Optional)

1. **Integration Tests** - Full API endpoint testing
2. **Performance Tests** - Load testing and optimization
3. **Security Audit** - Professional security review
4. **Key Derivation** - Use PBKDF2 or Argon2 instead of SHA-256
5. **Backup Services** - Email notifications for key backup
6. **Admin Dashboard** - Monitor alerts and submissions
7. **Notification Service** - Push notifications for access grants
