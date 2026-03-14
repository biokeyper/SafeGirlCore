# SafeGirl Backend - Database Schema

## Schema Overview

The SafeGirl database uses PostgreSQL to store user data, reports, access control, notifications, emergency contacts, and audit trails. The schema is designed for:

- **Immutability**: Audit logging on all changes
- **Privacy**: Encrypted data at application layer
- **Resilience**: Redundant tracking of blockchain state
- **Performance**: Strategic indexing for common queries

---

## Entity Relationship Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATABASE SCHEMA                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                          ┌─────────────────────┐     │
│  │     users       │                          │   submissions       │     │
│  ├─────────────────┤                          ├─────────────────────┤     │
│  │ id (PK)         │                          │ id (PK)             │     │
│  │ userId (UQ)     │◄──────┬──────────────────┤ userId (FK)         │     │
│  │ phone (UQ)      │       │                  │ reportId (UQ)       │     │
│  │ email (UQ)      │       │                  │ ipfsHash            │     │
│  │ pin             │       │                  │ txHash (UQ)         │     │
│  │ customPanic     │       │                  │ status              │     │
│  │ phone_verified  │       │                  │ encryptionKey*      │     │
│  │ email_verified  │       │                  │ encryptionKeyIv     │     │
│  │ createdAt       │       │                  │ createdAt           │     │
│  │ lastLogin       │       │                  │ confirmedAt         │     │
│  │ lastPhoneChange │       │                  └─────────────────────┘     │
│  └─────────────────┘       │                                                │
│       │                     │                  ┌─────────────────────┐     │
│       │                     │                  │ report_access       │     │
│       │                     │                  ├─────────────────────┤     │
│       │                     │                  │ id (PK)             │     │
│       │                     │    ┌─────────────┤ reportId (FK)       │     │
│       │                     │    │             │ reporterId (FK)     │     │
│       │                     └────┤─ viewerId (FK) │ viewerId (FK)       │     │
│       │                         │ │ grantedAt       │     │
│       │                         │ │ expiresAt       │     │
│       │                         │ │ isActive        │     │
│       │                         │ └─────────────────┘     │
│       │                         │                         │
│       │    ┌────────────────────┼─────────────────────┐   │
│       │    │                    │                     │   │
│       │    ▼                    ▼                     ▼   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐
│  │  emergency_     │  │      otps        │  │     panic_      │
│  │   contacts      │  ├──────────────────┤  │     alerts      │
│  ├─────────────────┤  │ id (PK)          │  ├─────────────────┤
│  │ id (PK)         │  │ userId (FK)      │  │ id (PK)         │
│  │ userId (FK)     │  │ phone            │  │ userId (FK)     │
│  │ phone           │  │ otp_code         │  │ txHash          │
│  │ name            │  │ otp_type         │  │ blockNumber     │
│  │ relationship    │  │ attempts         │  │ locationData    │
│  │ isActive        │  │ is_used          │  │ createdAt       │
│  │ createdAt       │  │ expires_at       │  │ confirmedAt     │
│  └─────────────────┘  └──────────────────┘  └─────────────────┘
│       │
│       └──────────────────────────┬───────────────────────┐
│                                  │                       │
│  ┌─────────────────┐  ┌──────────┴──────┐  ┌─────────────┴──────┐
│  │   panic_audit   │  │  notifications  │  │  recovery_tokens  │
│  │     _log        │  ├─────────────────┤  ├───────────────────┤
│  ├─────────────────┤  │ id (PK)         │  │ id (PK)           │
│  │ id (PK)         │  │ userId (FK)     │  │ userId (FK)       │
│  │ alertId (FK)    │  │ type            │  │ token (UQ)        │
│  │ userId (FK)     │  │ title           │  │ token_type        │
│  │ action          │  │ message         │  │ new_phone         │
│  │ contactPhone    │  │ isRead          │  │ is_used           │
│  │ smsStatus       │  │ createdAt       │  │ expires_at        │
│  │ metadata        │  │ readAt          │  │ created_at        │
│  │ createdAt       │  └─────────────────┘  └───────────────────┘
│  └─────────────────┘
│
│  ┌──────────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  │   submission_audit   │  │   tampering_     │  │   key_backups    │
│  │      _log            │  │    alerts        │  ├──────────────────┤
│  ├──────────────────────┤  ├──────────────────┤  │ id (PK)          │
│  │ id (PK)              │  │ id (PK)          │  │ userId (FK, UQ)  │
│  │ reportId (FK)        │  │ reportId (FK, UQ)│  │ encryptedKey     │
│  │ fieldChanged         │  │ dbValue          │  │ keyIv            │
│  │ oldValue             │  │ blockchainValue  │  │ keyAuthTag       │
│  │ newValue             │  │ correctionApplied│  │ pinHash          │
│  │ changeReason         │  │ detectedAt       │  │ backupCreatedAt  │
│  │ changedBy            │  │ correctedAt      │  │ lastRecoveryAttempt
│  │ changedAt            │  └──────────────────┘  │ recoveryAttempts │
│  └──────────────────────┘                        └──────────────────┘
│
└─────────────────────────────────────────────────────────────────────────────┘

Legend:
  PK = Primary Key
  FK = Foreign Key
  UQ = Unique Constraint
  *  = Encrypted at application layer
```

---

## Table Reference

### `users`

Stores user account information (phone-only authentication).

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Auto-increment primary key |
| `userId` | `VARCHAR(255)` | UNIQUE, NOT NULL | UUID identifier for user |
| `phone` | `VARCHAR(20)` | UNIQUE, NOT NULL | E.164 format (+256750902921) |
| `email` | `VARCHAR(255)` | UNIQUE, NULL | Optional recovery email |
| `phone_verified` | `BOOLEAN` | DEFAULT FALSE | Phone verification status |
| `email_verified` | `BOOLEAN` | DEFAULT FALSE | Email verification status |
| `pin` | `VARCHAR(6)` | NULL | Content lock PIN (1-6 digits, plaintext) |
| `customPanicMessage` | `VARCHAR(255)` | NULL | Custom message for emergency contacts |
| `createdAt` | `TIMESTAMP` | DEFAULT NOW() | Account creation time |
| `lastLogin` | `TIMESTAMP` | NULL | Last successful login |
| `lastPhoneChange` | `TIMESTAMP` | NULL | Last phone number change |

**Indexes:**
- `idx_users_userId` on `userId` (unique lookup)
- `idx_users_phone` on `phone` (OTP lookups)
- `idx_users_email` on `email` (recovery emails)

**Design Notes:**
- PIN stored as plaintext (acceptable for UI-level content lock, not authentication)
- Email is optional (signup is phone-only)
- `phone_verified` always TRUE after OTP signup
- `email_verified` requires separate email confirmation (not yet implemented)

---

### `submissions`

Core table for report submissions and blockchain verification.

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Auto-increment |
| `reportId` | `VARCHAR(255)` | UNIQUE, NOT NULL | User-facing report ID |
| `userId` | `VARCHAR(255)` | FK(users.userId) | Report owner |
| `txHash` | `VARCHAR(255)` | UNIQUE, NULL | Blockchain transaction hash |
| `blockNumber` | `BIGINT` | NULL | Blockchain block number (immutability proof) |
| `gasUsed` | `VARCHAR(255)` | NULL | Gas consumed by transaction |
| `ipfsHash` | `VARCHAR(255)` | NULL | IPFS CIDv1 of encrypted report |
| `status` | `VARCHAR(50)` | DEFAULT 'pending' | pending \| confirmed \| failed |
| `responses` | `TEXT[]` | NULL | Survey responses (plaintext) |
| `metadata` | `JSONB` | NULL | Optional metadata (category, etc) |
| `encryptionKey` | `VARCHAR(255)` | NULL | Encrypted report key (hex) |
| `encryptionKeyIv` | `VARCHAR(255)` | NULL | IV for key encryption (hex) |
| `encryptionKeyAuthTag` | `VARCHAR(255)` | NULL | Auth tag for key encryption (hex) |
| `encryptionDataIv` | `VARCHAR(255)` | NULL | IV for data encryption (hex) |
| `encryptionDataAuthTag` | `VARCHAR(255)` | NULL | Auth tag for data encryption (hex) |
| `isArchived` | `BOOLEAN` | DEFAULT FALSE | Soft-delete for privacy |
| `archivedAt` | `TIMESTAMP` | NULL | When archived |
| `archivedReason` | `VARCHAR(255)` | NULL | Why archived |
| `createdAt` | `TIMESTAMP` | DEFAULT NOW() | Report submission time |
| `updatedAt` | `TIMESTAMP` | DEFAULT NOW() | Last update (auto-updated) |
| `confirmedAt` | `TIMESTAMP` | NULL | Blockchain confirmation time |

**Indexes:**
- `idx_submissions_reportId` (fast lookups)
- `idx_submissions_status` (filter by status)
- `idx_submissions_txHash` (blockchain verification)
- `idx_submissions_createdAt DESC` (time-based queries)
- `idx_submissions_userId` (user-specific reports)

**Triggers:**
- `submissions_updated_at_trigger` (auto-update `updatedAt` on changes)

**Design Notes:**
- `txHash` is NULLABLE to support non-blocking panic alerts
- `status` tracks DB consistency with blockchain
- Encryption columns store hex-encoded values (never plaintext)
- `isArchived` provides soft-delete (blockchain record preserved)

---

### `report_access`

Database-only access control (blockchain grants bypassed for instant revocation).

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Auto-increment |
| `reportId` | `VARCHAR(255)` | FK(submissions.reportId) | Report being shared |
| `reporterId` | `VARCHAR(255)` | FK(users.userId) | Report owner |
| `viewerId` | `VARCHAR(255)` | FK(users.userId) | User granted access |
| `grantedAt` | `TIMESTAMP` | DEFAULT NOW() | Grant time |
| `expiresAt` | `TIMESTAMP` | NULL | Optional expiry |
| `isActive` | `BOOLEAN` | DEFAULT TRUE | Revocation flag |
| `revokedAt` | `TIMESTAMP` | NULL | Revocation time |

**Constraints:**
- `UNIQUE(reportId, reporterId, viewerId)` (one access per triplet)
- `FOREIGN KEY reportId` (cascade on report deletion)

**Indexes:**
- `idx_access_reportId` (reports owned)
- `idx_access_viewerId` (reports accessible to user)
- `idx_access_reporterId` (reports shared by user)
- `idx_access_active` (active access for user)

**Query Pattern:**
```sql
-- Check if user can view report
SELECT 1 FROM report_access
WHERE reportId=$1 AND viewerId=$2
  AND isActive=TRUE
  AND (expiresAt IS NULL OR expiresAt > NOW())
```

---

### `emergency_contacts`

Emergency contacts for panic alert SMS notifications.

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Auto-increment |
| `userId` | `VARCHAR(255)` | FK(users.userId) ON DELETE CASCADE | Contact owner |
| `phone` | `VARCHAR(20)` | NOT NULL | Contact phone (E.164) |
| `name` | `VARCHAR(255)` | NULL | Contact name (from device) |
| `relationship` | `VARCHAR(50)` | NULL | Type: "mother", "friend", "police", etc |
| `isActive` | `BOOLEAN` | DEFAULT TRUE | Whether to send alerts |
| `createdAt` | `TIMESTAMP` | DEFAULT NOW() | Contact creation time |
| `updatedAt` | `TIMESTAMP` | DEFAULT NOW() | Last update |

**Constraints:**
- `UNIQUE(userId, phone)` (one entry per user-contact combo)
- `FOREIGN KEY userId` with CASCADE delete

**Indexes:**
- `idx_emergency_userId` (fetch user's contacts)
- `idx_emergency_active` (active contacts only)
- `idx_emergency_createdAt DESC` (recent contacts)

**Design Notes:**
- `isActive` allows deactivation without deletion
- No verification needed (user owns contact info)

---

### `panic_alerts`

Core panic alert records (non-blocking flow).

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Alert ID |
| `userId` | `VARCHAR(255)` | FK(users.userId) | User who panicked |
| `locationData` | `VARCHAR(500)` | NULL | GPS/map coordinates |
| `txHash` | `VARCHAR(255)` | UNIQUE, NULL | Blockchain confirmation |
| `blockNumber` | `BIGINT` | NULL | Blockchain block |
| `createdAt` | `TIMESTAMP` | DEFAULT NOW() | Alert time |

**Indexes:**
- `idx_panic_userId` (user's alerts)
- `idx_panic_createdAt DESC` (recent alerts)

**Design Notes:**
- `txHash` is NULLABLE (initial insert doesn't wait for blockchain)
- Background job fills in `txHash` when confirmed
- Alert always exists immediately (non-blocking guarantee)

---

### `panic_audit_log`

Audit trail for panic alert operations (compliance/investigation).

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Log entry ID |
| `alertId` | `INTEGER` | FK(panic_alerts.id) ON DELETE CASCADE | Alert reference |
| `userId` | `VARCHAR(255)` | FK(users.userId) ON DELETE CASCADE | User reference |
| `action` | `VARCHAR(50)` | NOT NULL | panic_created \| sms_sent \| sms_failed \| blockchain_confirmed \| blockchain_failed |
| `contactPhone` | `VARCHAR(20)` | NULL | For SMS actions, contact number |
| `smsStatus` | `VARCHAR(50)` | NULL | sent \| failed \| pending |
| `failureReason` | `VARCHAR(255)` | NULL | Error message if failed |
| `metadata` | `JSONB` | NULL | SMS response, blockchain data, etc |
| `createdAt` | `TIMESTAMP` | DEFAULT NOW() | Action timestamp |

**Indexes:**
- `idx_panic_audit_alertId` (alert history)
- `idx_panic_audit_userId` (user history)
- `idx_panic_audit_action` (filter by action)
- `idx_panic_audit_createdAt DESC` (timeline)

**Sample Entries:**
```json
{
  "action": "panic_created",
  "createdAt": "2026-03-14T10:30:00Z"
},
{
  "action": "sms_sent",
  "contactPhone": "+256701234567",
  "smsStatus": "sent",
  "metadata": {
    "twilio_sid": "SM1234567890abcdef",
    "message": "I need help immediately..."
  }
},
{
  "action": "sms_failed",
  "contactPhone": "+256701234568",
  "smsStatus": "failed",
  "failureReason": "Invalid phone number"
}
```

---

### `otps`

One-time passwords for signup/login authentication.

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Auto-increment |
| `userId` | `VARCHAR(255)` | FK(users.userId) ON DELETE CASCADE, NULL | User (NULL for signup) |
| `phone` | `VARCHAR(20)` | NOT NULL | Phone OTP sent to |
| `otp_code` | `VARCHAR(6)` | NOT NULL | 6-digit code |
| `otp_type` | `VARCHAR(50)` | NOT NULL | signup \| login \| phone_change \| recovery |
| `attempts` | `INTEGER` | DEFAULT 0 | Failed attempt count |
| `max_attempts` | `INTEGER` | DEFAULT 3 | Max allowed attempts |
| `is_used` | `BOOLEAN` | DEFAULT FALSE | Marked after successful verification |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | OTP generation time |
| `expires_at` | `TIMESTAMP` | NOT NULL | 5 minutes from creation |
| `verified_at` | `TIMESTAMP` | NULL | Verification time |

**Indexes:**
- `idx_otp_phone` (lookup by phone)
- `idx_otp_userId` (user's OTPs)
- `idx_otp_type` (filter by type)
- `idx_otp_expires` (cleanup of expired)

**Validation:**
```
✓ Not expired: expires_at > NOW()
✓ Not used: is_used = FALSE
✓ Attempts: attempts < max_attempts
✓ Code matches: otp_code = user_input
```

---

### `recovery_tokens`

Email-based account recovery tokens (24-hour expiry).

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Auto-increment |
| `userId` | `VARCHAR(255)` | FK(users.userId) ON DELETE CASCADE | Account to recover |
| `email` | `VARCHAR(255)` | NOT NULL | Email token sent to |
| `token` | `VARCHAR(255)` | UNIQUE, NOT NULL | Random recovery token |
| `token_type` | `VARCHAR(50)` | NOT NULL | phone_recovery \| email_recovery |
| `new_phone` | `VARCHAR(20)` | NULL | Proposed new phone |
| `is_used` | `BOOLEAN` | DEFAULT FALSE | Marked after successful recovery |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Token generation |
| `expires_at` | `TIMESTAMP` | NOT NULL | 24 hours from creation |
| `used_at` | `TIMESTAMP` | NULL | Recovery completion time |

**Indexes:**
- `idx_recovery_token` (email link validation)
- `idx_recovery_userId` (user's tokens)
- `idx_recovery_expires` (cleanup of expired)

---

### `notifications`

User notification system (for all events: access grants, panic alerts, etc).

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Notification ID |
| `userId` | `VARCHAR(255)` | FK(users.userId) | Recipient |
| `type` | `VARCHAR(50)` | NOT NULL | access_granted \| panic_alert \| report_submitted \| access_revoked \| report_updated |
| `title` | `VARCHAR(255)` | NOT NULL | Notification title |
| `message` | `TEXT` | NOT NULL | Notification message |
| `relatedId` | `VARCHAR(255)` | NULL | reportId or accessId |
| `isRead` | `BOOLEAN` | DEFAULT FALSE | Read status |
| `createdAt` | `TIMESTAMP` | DEFAULT NOW() | Creation time |
| `readAt` | `TIMESTAMP` | NULL | Read time |

**Indexes:**
- `idx_notification_userId` (user's notifications)
- `idx_notification_isRead` (unread count)
- `idx_notification_createdAt DESC` (timeline)
- `idx_notification_type` (filter by type)

**Sample Entry:**
```json
{
  "type": "access_granted",
  "title": "Report shared with you",
  "message": "John Doe has shared a report with you",
  "relatedId": "report-abc-123"
}
```

---

### `key_backups`

Encrypted backup of encryption keys for recovery (PIN-based).

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Auto-increment |
| `userId` | `VARCHAR(255)` | FK(users.userId), UNIQUE | User's backup |
| `encryptedKey` | `VARCHAR(255)` | NOT NULL | Backup key encrypted with PIN (hex) |
| `keyIv` | `VARCHAR(255)` | NOT NULL | IV for encryption (hex) |
| `keyAuthTag` | `VARCHAR(255)` | NOT NULL | Auth tag for encryption (hex) |
| `pinHash` | `VARCHAR(255)` | NOT NULL | SHA-256(PIN) for validation |
| `backupCreatedAt` | `TIMESTAMP` | DEFAULT NOW() | Backup creation time |
| `lastRecoveryAttempt` | `TIMESTAMP` | NULL | Last recovery attempt |
| `recoveryAttempts` | `INTEGER` | DEFAULT 0 | Attempt count (for rate limiting) |

**Indexes:**
- `idx_backup_userId` (user's backup)
- `idx_backup_createdAt DESC` (recent backups)

**Flow:**
1. User calls `POST /api/keys/backup` with PIN
2. Frontend encrypts key with PIN, sends encrypted key + pinHash
3. Backend stores encrypted key + SHA-256(PIN) hash
4. User calls `POST /api/keys/recover` with phone + pinHash
5. Backend validates pinHash matches, returns encrypted key
6. Frontend decrypts with PIN

---

### `submission_audit_log`

Tracks all changes to submissions for security investigation.

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Auto-increment |
| `reportId` | `VARCHAR(255)` | FK(submissions.reportId) | Report reference |
| `fieldChanged` | `VARCHAR(100)` | NOT NULL | Field name (e.g., "txHash") |
| `oldValue` | `VARCHAR(255)` | NULL | Previous value |
| `newValue` | `VARCHAR(255)` | NULL | New value |
| `changeReason` | `VARCHAR(50)` | DEFAULT 'unknown' | api_update \| blockchain_sync \| tampering_detected \| system_fix |
| `changedBy` | `VARCHAR(100)` | NULL | 'system', 'api', 'background_job' |
| `changedAt` | `TIMESTAMP` | DEFAULT NOW() | Change timestamp |

**Indexes:**
- `idx_audit_reportId` (audit trail per report)
- `idx_audit_reason` (filter by type)
- `idx_audit_changedAt DESC` (timeline)

---

### `tampering_alerts`

Detects mismatches between database and blockchain state.

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `SERIAL` | PRIMARY KEY | Auto-increment |
| `reportId` | `VARCHAR(255)` | FK(submissions.reportId), UNIQUE | Affected report |
| `dbValue` | `VARCHAR(255)` | NULL | Value in database |
| `blockchainValue` | `VARCHAR(255)` | NULL | Value on blockchain |
| `correctionApplied` | `BOOLEAN` | DEFAULT FALSE | Whether corrected |
| `detectedAt` | `TIMESTAMP` | DEFAULT NOW() | Detection time |
| `correctedAt` | `TIMESTAMP` | NULL | Correction time |

**Indexes:**
- `idx_alerts_reportId` (report investigation)
- `idx_alerts_detected DESC` (recent alerts)

**Example Tampering Detection:**
```
DB:         txHash = "0x123", status = "pending"
Blockchain: No transaction with hash 0x123
Action:     Create tampering_alert, log to audit_log
```

---

## Views

### `pending_submissions`

Reports awaiting blockchain confirmation.

```sql
CREATE VIEW pending_submissions AS
SELECT * FROM submissions
WHERE status = 'pending'
ORDER BY createdAt DESC;
```

**Use:** Monitor submissions in progress.

### `confirmed_submissions`

Blockchain-confirmed reports (immutable).

```sql
CREATE VIEW confirmed_submissions AS
SELECT * FROM submissions
WHERE status = 'confirmed'
ORDER BY confirmedAt DESC;
```

**Use:** Query finalized reports.

---

## Migration History

Migrations execute in order. Each migration is idempotent (can run multiple times safely).

| File | Description | Status |
|------|-------------|--------|
| `db/init.sql` | Core schema (submissions, users, otps, recovery_tokens, etc) | ✓ Applied |
| `add_pin_column.sql` | Add `pin` column to users (content lock) | ✓ Applied |
| `add_emergency_contacts.sql` | Create emergency_contacts table | ✓ Applied |
| `add_panic_audit_log.sql` | Create panic_audit_log for compliance | ✓ Applied |
| `add_notifications_table.sql` | Create notifications system | ✓ Applied |
| `add_pin_and_custom_panic_message.sql` | Add `customPanicMessage` to users | ✓ Applied |
| `add_userid_to_submissions.sql` | Add `userId` to submissions | ✓ Applied |
| `remove_walletaddress_column.sql` | Remove old blockchain address (cleaned up) | ✓ Applied |

### How to Apply Migrations

```bash
# New database (from scratch)
cd backend/
psql -U safegirl_user -d safegirl_db -f db/init.sql

# Run migrations in order
for file in db/migrations/*.sql; do
  psql -U safegirl_user -d safegirl_db -f "$file"
done

# Existing database
# Migrations are safe to re-run (idempotent)
psql -U safegirl_user -d safegirl_db -f db/migrations/add_pin_column.sql
# ... etc
```

---

## Key Design Decisions

### Why PostgreSQL?

- **ACID Compliance**: Guarantees data consistency (critical for security)
- **JSON Support**: Flexible metadata storage (JSONB)
- **Triggers**: Auto-update timestamps, audit logging
- **Views**: Pre-computed queries for dashboards
- **Scalability**: Connection pooling, read replicas

### Why `txHash` is Nullable

Originally, all reports had blockchain transactions. With non-blocking panic alerts:
- User triggers panic → alert inserted immediately (no txHash yet)
- Background job confirms on blockchain → txHash added later

Nullable `txHash` supports this async flow.

### Why Access Control is Database-Only

Blockchain access grants are slow (2-5 sec per transaction). Users expect instant revocation. Solution:

1. **Grant Access**: Insert to `report_access` table (instant)
2. **Revoke Access**: Update `isActive=FALSE` (instant)
3. **View Report**: Check `report_access` table (no blockchain call)
4. **Blockchain**: Tracks grants/revokes for audit (not enforced)

### Why PIN is Plaintext

PIN is used for:
- UI-level content lock (not authentication)
- Key backup encryption (frontend encrypts, not backend)
- Rate limiting on key recovery (5 attempts/15min)

It's not security-critical (not password), so plaintext is acceptable. Frontend controls actual decryption.

### Why `responses` is Stored Plaintext

Report `responses[]` (survey answers) are stored plaintext on blockchain. This allows:
- Blockchain querying (filter by response values)
- Emergency responder visibility (if needed)
- Public audit trail (responses reveal incident type)

Sensitive details go in `payload` (encrypted on IPFS).

### Soft-Delete via `isArchived`

Users can archive reports to hide from library, but keep blockchain record intact. This provides:
- Privacy (user can hide reports)
- Auditability (blockchain immutability preserved)
- Recovery (can unarchive if needed)

---

## Performance Tuning

### Index Optimization

```sql
-- Commonly used queries already indexed:
-- 1. User lookups by userId, phone, email
SELECT * FROM users WHERE userId = $1;

-- 2. Reports by status, time, user
SELECT * FROM submissions WHERE status = $1 ORDER BY createdAt DESC;

-- 3. Access control checks
SELECT 1 FROM report_access
WHERE reportId=$1 AND viewerId=$2 AND isActive=TRUE;

-- 4. Notifications for user
SELECT * FROM notifications
WHERE userId=$1 AND isRead=FALSE ORDER BY createdAt DESC;
```

### Query Planning

```bash
# Check query plans
EXPLAIN ANALYZE SELECT * FROM submissions WHERE status='pending';

# Identify missing indexes
SELECT * FROM pg_stat_user_tables WHERE seq_scan > 1000;
```

### Connection Pooling

```javascript
// configured in database.js
const pool = new Pool({
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## Backup & Recovery

### Daily Backups

```bash
# Full database backup
pg_dump -U safegirl_user -d safegirl_db > backup_$(date +%Y%m%d).sql

# Compress
gzip backup_*.sql

# Restore from backup
psql -U safegirl_user -d safegirl_db < backup_20260314.sql
```

### Point-in-Time Recovery

PostgreSQL WAL archiving enables recovery to any point in time:

```bash
# Enable in postgresql.conf
archive_mode = on
archive_command = 'cp %p /wal_archive/%f'

# Restore
pg_ctl start -D /var/lib/postgresql/data \
  -c "recovery_target_timeline=latest" \
  -c "recovery_target_time='2026-03-14 10:30:00'"
```

---

## Data Privacy & Compliance

### GDPR Compliance

- **Right to Deletion**: Archive report (`isArchived=TRUE`) or use `DELETE` with audit trail
- **Data Portability**: Export user's reports + metadata in JSON
- **Data Minimization**: Store only necessary fields (no IP addresses, user agents, etc)
- **Encryption**: All sensitive data encrypted at application layer

### Audit Trail

- All changes logged to `submission_audit_log`
- Tampering alerts in `panic_alerts` and `tampering_alerts`
- Compliance investigation via `panic_audit_log`

### Data Retention Policy

```sql
-- Delete expired OTPs (weekly)
DELETE FROM otps WHERE expires_at < NOW() - INTERVAL '7 days';

-- Delete expired recovery tokens (monthly)
DELETE FROM recovery_tokens WHERE expires_at < NOW() - INTERVAL '30 days';

-- Archive old reports (yearly, after user consent)
UPDATE submissions SET isArchived=TRUE, archivedAt=NOW()
WHERE createdAt < NOW() - INTERVAL '1 year' AND isArchived=FALSE;
```

---

## Additional Resources

- **OpenAPI Spec**: `docs/openapi.yaml`
- **Architecture**: `docs/ARCHITECTURE.md`
- **Setup Guide**: `docs/SETUP.md`
