# Encryption Key Rotation - Quick Reference

## Current Status

**Production:** No key rotation yet (MVP)
**Implementation:** Optional enhancement for key rotation support
**Ready to Deploy:** Can deploy current single-key approach to production

---

## When to Rotate Keys

| Event | Action | Timeline |
|-------|--------|----------|
| Scheduled rotation | Rotate proactively | Every 30 days (production) or 90 days (staging) |
| Suspected leak | Immediate emergency rotation | Within 1 hour |
| Accidental exposure | Rotate immediately | Same day |
| Regular maintenance | Planned rotation | Monthly maintenance window |

---

## Rotation Procedure (Quick Steps)

### Step 1: Generate New Key (5 min)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: abc123def456...
```

### Step 2: Deploy to Production (10 min)
```bash
# 1. Add new key to GitHub Secrets
# GitHub → Settings → Secrets → ENCRYPTION_MASTER_KEY_V2=abc123...
# Keep old: ENCRYPTION_MASTER_KEY_PREVIOUS=old_value

# 2. Deploy service (it auto-picks up new env var)
# Render redeploys automatically from GitHub

# 3. Service now has both keys active
# - Uses new key for all NEW encryptions
# - Can decrypt with both keys
```

### Step 3: Migrate Historical Data (1-2 hours)
```bash
# When ready (can be later, doesn't block users)
npm run script:rotate-key

# Or dry-run first to verify
npm run script:rotate-key -- --dry-run
```

### Step 4: Cleanup (After Migration Complete)
```bash
# 1. Verify all data migrated
SELECT COUNT(*) FROM submissions WHERE key_version = 1;  # Should be 0

# 2. Remove old key from production
# GitHub → Settings → Secrets → Remove ENCRYPTION_MASTER_KEY_PREVIOUS

# 3. Update encryption_key_audit table (if using)
UPDATE encryption_key_audit SET rotated_at = NOW() WHERE version = 1;
```

---

## For MVP (Current Approach)

**Do NOT implement key rotation yet** - It's optional:

- ✅ Current single-key approach works fine
- ✅ No breaking changes needed
- ✅ Simple and reliable
- ❌ Cannot rotate keys without downtime

**When to implement:**
- After production launch and stable
- When handling sensitive data at scale
- As part of production hardening (Phase 2+)

---

## Implementation Path

### Phase 1: MVP (Now) ✅
- Single encryption key
- Works for all use cases
- Deploy to production as-is

### Phase 2: Key Rotation Ready (Later)
- Add key_version column (migration file created)
- Update EncryptionService (encryptionWithRotation.ts created)
- Add rotation script (rotateEncryptionKey.ts created)
- Document procedures (ENCRYPTION_KEY_ROTATION.md created)

### Phase 3: Production Hardening
- Deploy Phase 2 code
- Run first rotation test
- Add monitoring and alerts
- Document runbook for operations team

---

## Files Created

| File | Purpose | Status |
|------|---------|--------|
| ENCRYPTION_KEY_ROTATION.md | Full rotation guide | ✅ Ready |
| encryptionWithRotation.ts | Support multiple keys | ✅ Ready |
| add_encryption_key_versioning.sql | Database schema | ✅ Ready |
| rotateEncryptionKey.ts | Migration script | ✅ Ready |
| This guide | Quick reference | ✅ Ready |

---

## Testing (When Ready)

```bash
# Test with dry-run first
npm run script:rotate-key -- --dry-run

# Then run for real
npm run script:rotate-key

# Verify success
psql $DATABASE_URL -c "SELECT COUNT(*) FROM submissions WHERE key_version = 1;"
# Should return: 0
```

---

## Cost

- ✅ Zero additional cost
- ✅ No new services needed
- ✅ Just database updates
- ✅ Runs as background job

---

## Security

| Aspect | Current | With Rotation |
|--------|---------|---------------|
| Key exposure window | Unlimited | 7-30 days |
| Backup keys | None | Stored securely |
| Compliance | Good | Better (PCI-DSS level) |
| Audit trail | None | Full history tracked |

---

## Decision: Should We Implement Now?

### NO (Recommended for MVP)
- ✅ Adds complexity
- ✅ Not needed for first 100-1000 users
- ✅ Can add later without breaking changes
- ✅ Single key is secure enough
- ✅ Focus on core features first

### YES (If Handling Sensitive Data)
- ✅ Encryption best practice
- ✅ Required for some compliance standards
- ✅ Code already written and ready
- ✅ Can deploy without migration script
- ❌ Takes 3-4 hours to integrate

**Recommendation:** Deploy MVP with current single-key approach. Implement key rotation after launch when handling scale.

---

## Reference

- Full guide: `ENCRYPTION_KEY_ROTATION.md`
- Service code: `backend/services/encryptionWithRotation.ts`
- Migration: `backend/scripts/rotateEncryptionKey.ts`
- Schema: `backend/db/migrations/add_encryption_key_versioning.sql`
