# Encryption Master Key Rotation Strategy

## Overview

Encryption master key rotation limits exposure if a key is ever compromised. This document outlines how to rotate keys safely without losing or corrupting data.

**Current Architecture:**
- Master key (32 bytes) encrypts per-report keys
- Per-report keys encrypt report payloads
- All data uses same master key (no versioning)

**Target Architecture:**
- Support multiple active keys during rotation window
- Track which key encrypted each report (key_version column)
- Seamless rotation with zero downtime

---

## Threat Scenario

**Without key rotation:**
```
Jan 1: Master key leaked
Jan 1: Attacker has all historical data until new key deployed
Timeline: Unlimited exposure window
```

**With key rotation:**
```
Jan 1: Master key leaked
Jan 1: Immediate key rotation initiated
Jan 8: All data re-encrypted with new key (old key available for 7 days)
Timeline: ~7 day exposure window (only recent data at risk)
```

---

## Database Schema Changes

### Add Key Version Tracking

```sql
-- Add to submissions table
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS key_version INTEGER DEFAULT 1;

-- Index for querying by key version
CREATE INDEX IF NOT EXISTS idx_submissions_key_version ON submissions(key_version);

-- Add comment
COMMENT ON COLUMN submissions.key_version IS 'Version of master key used to encrypt this report (1=original, 2=rotated, etc)';
```

### Key Management Table (Optional - For Tracking)

```sql
-- Track all keys ever used (one row per rotation)
CREATE TABLE IF NOT EXISTS encryption_keys (
  id SERIAL PRIMARY KEY,
  version INTEGER UNIQUE NOT NULL,
  key_hash VARCHAR(64) NOT NULL,  -- SHA256 hash of key (for audit trail, not actual key)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT FALSE,   -- Can decrypt with this key
  rotated_at TIMESTAMP,           -- When this key stopped being used for encryption
  rotated_by VARCHAR(255),        -- Who rotated (e.g., 'admin', 'automated')
  notes TEXT                      -- Rotation reason (e.g., 'scheduled rotation', 'emergency rotation')
);

-- Only one key should be active for encryption at a time
CREATE UNIQUE INDEX idx_active_encryption_key ON encryption_keys(active) WHERE active = true;

CREATE INDEX idx_encryption_keys_version ON encryption_keys(version);
CREATE INDEX idx_encryption_keys_created ON encryption_keys(created_at DESC);
```

---

## Rotation Procedure

### Phase 1: Prepare New Key (5 minutes)

```bash
# 1. Generate new master key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: abc123def456...

# 2. Store in secure location (password manager, HashiCorp Vault, etc.)
# DO NOT commit to git

# 3. Log key rotation event
echo "Key rotation started: $(date)" >> /var/log/safegirl/encryption.log
```

### Phase 2: Update Service (Deployment)

```bash
# 1. Add new key to GitHub Secrets (keep old key)
# GitHub Settings → Secrets
# ENCRYPTION_MASTER_KEY_V2=abc123def456...
# ENCRYPTION_MASTER_KEY_V1=old_key_value (keep for decryption)

# 2. Update .env locally
ENCRYPTION_MASTER_KEY=abc123def456...
ENCRYPTION_MASTER_KEY_PREVIOUS=old_key_value

# 3. Update EncryptionService to support multiple keys
# (See code changes below)

# 4. Deploy to staging first
git commit -m "Support multiple encryption keys for rotation"
git push origin staging

# 5. Test on staging
./test-encryption.sh  # Run encryption tests

# 6. Deploy to production
git push origin main
```

### Phase 3: Re-encrypt Historical Data (1-24 hours)

```bash
# Run migration script to re-encrypt all reports with new key
npm run script:rotate-encryption-key

# Script does:
# 1. Connect to database
# 2. Query all reports with key_version = 1
# 3. Decrypt with old key (key_version 1)
# 4. Re-encrypt with new key (key_version 2)
# 5. Update key_version in database
# 6. Log progress
# 7. Handle errors gracefully (skip corrupted records, log for manual review)

# Can run as batch job (doesn't block user requests)
# Can pause/resume if needed
# Can rollback if issues detected
```

### Phase 4: Cleanup (1-7 days after rotation)

```bash
# After all data is re-encrypted:

# 1. Verify all reports use new key
SELECT COUNT(*) FROM submissions WHERE key_version = 1;
# Should be 0

# 2. Remove old key from active use
# Update GitHub Secrets: Remove ENCRYPTION_MASTER_KEY_V1
# Update .env: Remove ENCRYPTION_MASTER_KEY_PREVIOUS

# 3. Update encryption_keys table (audit trail)
UPDATE encryption_keys SET rotated_at = NOW() WHERE version = 1;

# 4. Log completion
echo "Key rotation completed: $(date)" >> /var/log/safegirl/encryption.log
```

---

## Code Implementation

### Updated EncryptionService

```typescript
class EncryptionService {
  private masterKey: string;
  private previousMasterKey?: string;  // For decryption during rotation

  constructor() {
    // Current key (for encryption)
    this.masterKey = process.env.ENCRYPTION_MASTER_KEY || this.generateMasterKey();

    // Previous key (for decryption only, during rotation window)
    this.previousMasterKey = process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;

    if (!process.env.ENCRYPTION_MASTER_KEY) {
      logger.warn('ENCRYPTION', 'Using generated master key - set ENCRYPTION_MASTER_KEY in .env');
    }
  }

  /**
   * Encrypt report key with CURRENT master key
   * Always uses this.masterKey (version 2 after rotation)
   */
  encryptKey(reportKey: string, reportId: string): EncryptedKey {
    const masterKeyBuffer = Buffer.from(this.masterKey, 'hex');
    const keyIv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKeyBuffer, keyIv);
    let encryptedKey = cipher.update(reportKey, 'hex', 'hex');
    encryptedKey += cipher.final('hex');
    
    return {
      encryptedKey,
      keyIv: keyIv.toString('hex'),
      keyAuthTag: cipher.getAuthTag().toString('hex')
    };
  }

  /**
   * Decrypt report key with correct master key
   * Tries current key first, falls back to previous key if decryption fails
   * (Handles reports encrypted with old key during rotation window)
   */
  decryptKey(
    encryptedKey: string,
    keyIv: string,
    keyAuthTag: string,
    reportId: string,
    keyVersion: number = 1  // From database
  ): string {
    // Try with expected key version first
    const keys = [
      { version: 2, key: this.masterKey },
      { version: 1, key: this.previousMasterKey }
    ];

    for (const { version, key } of keys) {
      if (!key) continue;

      try {
        const masterKeyBuffer = Buffer.from(key, 'hex');
        const keyIvBuffer = Buffer.from(keyIv, 'hex');
        const keyAuthTagBuffer = Buffer.from(keyAuthTag, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', masterKeyBuffer, keyIvBuffer);
        decipher.setAuthTag(keyAuthTagBuffer);

        let reportKey = decipher.update(encryptedKey, 'hex', 'hex');
        reportKey += decipher.final('hex');

        if (version !== keyVersion) {
          logger.warn('ENCRYPTION', 'Decrypted with fallback key', { reportId, expected: keyVersion, used: version });
        }

        return reportKey;
      } catch (error) {
        logger.debug('ENCRYPTION', `Failed to decrypt with key v${version}`, { reportId });
        continue;
      }
    }

    throw new Error(`Failed to decrypt report key with any available key: ${reportId}`);
  }
}
```

### Migration Script

```typescript
// scripts/rotate-encryption-key.ts

import databaseService from '../backend/services/database';
import encryptionService from '../backend/services/encryption';
import logger from '../backend/utils/logger';

async function rotateEncryptionKey() {
  logger.info('ROTATION', 'Starting encryption key rotation');

  const batchSize = 100;
  let offset = 0;
  let rotatedCount = 0;
  let errorCount = 0;

  try {
    while (true) {
      // Fetch batch of reports encrypted with old key
      const result = await databaseService.query(
        'SELECT reportid, encryptionKey, encryptionKeyIv, encryptionKeyAuthTag FROM submissions WHERE key_version = 1 LIMIT $1 OFFSET $2',
        [batchSize, offset]
      );

      if (!result.rows || result.rows.length === 0) break;

      logger.info('ROTATION', `Processing batch: offset=${offset}, count=${result.rows.length}`);

      for (const report of result.rows) {
        try {
          // Decrypt with old key (key_version = 1)
          const reportKey = encryptionService.decryptKey(
            report.encryptionkey,
            report.encryptionkeyiv,
            report.encryptionkeyauthtag,
            report.reportid,
            1  // Specify old key version
          );

          // Re-encrypt with new key
          const newEncrypted = encryptionService.encryptKey(reportKey, report.reportid);

          // Update database
          await databaseService.query(
            `UPDATE submissions 
             SET encryptionKey = $1, encryptionKeyIv = $2, encryptionKeyAuthTag = $3, key_version = 2 
             WHERE reportid = $4`,
            [newEncrypted.encryptedKey, newEncrypted.keyIv, newEncrypted.keyAuthTag, report.reportid]
          );

          rotatedCount++;

          if (rotatedCount % 10 === 0) {
            logger.info('ROTATION', `Progress: ${rotatedCount} reports rotated`);
          }
        } catch (error) {
          logger.error('ROTATION', `Failed to rotate report ${report.reportid}`, {
            error: (error as Error).message
          });
          errorCount++;
        }
      }

      offset += batchSize;

      // Allow other requests to process
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.success('ROTATION', `Rotation complete: ${rotatedCount} rotated, ${errorCount} errors`);

    if (errorCount > 0) {
      logger.warn('ROTATION', `Manual review needed for ${errorCount} reports`);
    }
  } catch (error) {
    logger.error('ROTATION', 'Key rotation failed', {
      error: (error as Error).message
    });
    process.exit(1);
  }
}

rotateEncryptionKey();
```

---

## Schedule & Frequency

### Recommended Schedule

```
Development:  No rotation needed
Staging:      Rotate every 90 days (or on demand)
Production:   Rotate every 30 days OR immediately on breach
```

### Timeline

```
Monday 9am:   Initiate rotation
              - Generate new key
              - Add to GitHub Secrets
              - Deploy to staging
              - Test thoroughly

Tuesday 9am:  Deploy to production
              - New key active for encryption
              - Old key still available for decryption

Tuesday-Wed:  Run migration script
              - Re-encrypt all historical data
              - Batch process (1000s of records)

Friday 5pm:   Cleanup
              - Verify all data re-encrypted
              - Remove old key from production
              - Archive old key securely
```

---

## Rollback Procedure

If rotation fails or causes issues:

### Option 1: Keep Both Keys Active

```bash
# If migration incomplete or decryption failing:
# Keep both keys active indefinitely
# Re-run migration script to completion
# Then proceed with cleanup
```

### Option 2: Revert to Old Key

```bash
# If new key causes widespread issues:
# 1. Update ENCRYPTION_MASTER_KEY back to old key in GitHub Secrets
# 2. Redeploy services
# 3. Services revert to old key for both encryption and decryption
# 4. Investigate root cause
# 5. Retry rotation after fix
```

### Option 3: Restore from Backup

```bash
# If data corruption suspected:
# 1. Restore database from backup
# 2. Revert services to previous version
# 3. Investigate what went wrong
# 4. Manual review of affected records
```

---

## Security Best Practices

### Storage

- ✅ Store keys in GitHub Secrets (encrypted at rest)
- ✅ Use environment variables for deployment
- ❌ Never log or print actual keys
- ❌ Never commit keys to git
- ✅ Keep archive of old keys (encrypted, secured, offline)

### Rotation

- ✅ Rotate every 30 days (production) or 90 days (staging)
- ✅ Rotate immediately on breach or compromise
- ✅ Keep old key active for 7-30 days during rotation window
- ✅ Document all rotations in audit log

### Access Control

- ✅ Only DevOps/Security can update encryption keys
- ✅ Require approval for key rotation
- ✅ Audit all key access in GitHub Secrets logs
- ✅ Monitor for unauthorized decryption attempts

---

## Monitoring & Auditing

### Track Key Rotations

```sql
-- Query audit trail
SELECT * FROM encryption_keys ORDER BY created_at DESC;

-- Example output:
-- version | created_at        | active | rotated_at        | rotated_by
-- 2       | 2024-01-09 09:00 | true   | NULL              | NULL
-- 1       | 2024-01-01 00:00 | false  | 2024-01-09 16:00 | automated
```

### Monitor Decryption Failures

```bash
# Check logs for decryption errors
grep "Failed to decrypt" /var/log/safegirl/backend.log

# Alert if decryption failures exceed threshold
# (Indicates data corruption or key issue)
```

### Verify Rotation Success

```bash
# After migration, verify all data rotated
SELECT COUNT(*) as v1_reports FROM submissions WHERE key_version = 1;
# Should be 0

# Check rotation statistics
SELECT key_version, COUNT(*) FROM submissions GROUP BY key_version;
```

---

## Testing

### Unit Tests

```typescript
// Test encryption service with multiple keys
test('Decrypt with fallback key during rotation', () => {
  // Encrypt with old key
  // Switch to new key
  // Verify decryption still works with old key
  // Verify new encryption uses new key
});

// Test re-encryption migration
test('Rotate encryption key without data loss', async () => {
  // Create test report with old key
  // Run migration script
  // Verify report decrypts with new key
  // Verify key_version updated
});
```

### Integration Tests

```bash
# Full rotation in test environment
./test-encryption.sh --full-rotation

# Steps:
# 1. Create reports with current key
# 2. Switch to new key
# 3. Verify old reports still decrypt
# 4. Run migration script
# 5. Verify all reports use new key
# 6. Verify all reports decrypt correctly
```

---

## References

- [OWASP: Cryptographic Key Management](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [NIST: Key Management](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-57p1r3.pdf)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
