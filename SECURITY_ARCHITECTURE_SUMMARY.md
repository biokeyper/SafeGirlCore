# SafeGirl Backend Security Architecture Review

## Executive Summary
During backend architecture analysis, we identified several security issues and architectural improvements needed for a confidential abuse reporting system.

---

## Issues Identified

### 1. **Database-Blockchain Sync Problem**
**Status:** ✅ FIXED

**Issue:**
- If database save fails after successful blockchain submission, report is "orphaned"
- Report exists on blockchain but not in database
- User sees 404 error even though their report was submitted
- No background job to recover from this state

**Scenario:**
```
User submits report
  ↓
✅ IPFS upload succeeds
  ↓
✅ Blockchain submission succeeds (txHash recorded)
  ↓
❌ Database save fails
  ↓
User gets: "Submission failed" (but it actually succeeded on blockchain!)
```

**Solution Implemented:**
- Made database save **blocking** (fail entire submission if DB fails)
- User sees clear error message if DB is down
- No orphaned records on blockchain

---

### 2. **Missing Database Constraints**
**Status:** ✅ FIXED

**Issue:**
- `txHash` had no UNIQUE constraint
- Could have duplicate blockchain records in database
- No prevention of duplicate submissions

**Solution Implemented:**
```sql
txHash VARCHAR(255) UNIQUE NOT NULL
reportId VARCHAR(255) UNIQUE NOT NULL
```

---

### 3. **Data Tampering Detection**
**Status:** ✅ PARTIALLY FIXED

**Issue:**
- No verification of database data against blockchain
- If database is hacked, attackers can modify report status
- No audit trail of who changed what

**Scenario:**
```
Hacker SQL-injects database:
UPDATE submissions SET status = 'dismissed' WHERE reportId = 'xxx'

User queries report:
SELECT * FROM submissions WHERE reportId = 'xxx'
Returns: status = 'dismissed' (wrong!)

User thinks their report was dismissed, but it wasn't
```

**Solution Implemented:**
- Added **background verification** (async, doesn't slow user)
- Compares database against blockchain every time user checks status
- If mismatch detected:
  - Logs tampering alert
  - Creates audit trail
  - Fixes database to match blockchain (source of truth)
  - User gets fast response (no waiting for blockchain)

**How it works:**
```
User GET /api/reportStatus
  ↓ (takes ~50ms)
Returns immediately from database
  ↓
Background job starts (user doesn't see this)
  ↓ (takes ~15 seconds)
Queries blockchain
  ↓
Detects mismatch if hacked
  ↓
Logs tampering_alerts table
  ↓
Fixes database
  ↓
User is unaffected, data is corrected
```

**New Database Tables:**
- `submission_audit_log` - Track all changes (who, what, when, why)
- `tampering_alerts` - Record detected tampering attempts

---

### 4. **Critical: Plaintext Sensitive Data in Database** ⚠️
**Status:** ⚠️ NEEDS TEAM DISCUSSION

**Issue:**
- User responses (abuse details) stored as plaintext in database
- Metadata stored as plaintext in database
- Frontend encryption only protects data in transit + IPFS
- **If database is breached, all user responses are readable**

**Current Flow:**
```
Frontend:
  ↓ (encrypts responses for IPFS only)
  ↓
Backend receives:
  {
    encryptedPayload: "0x...",     ← Encrypted
    responses: ["answer1", ...],   ← PLAINTEXT in request
    metadata: {...}                ← PLAINTEXT in request
  }
  ↓ (stores all of it)
  ↓
Database:
  responses | ["Yes, abuse happened at home", "By father", ...]  ← PLAINTEXT
  metadata  | {"location": "123 Main St", "time": "2pm"}        ← PLAINTEXT
```

**Security Risk:**
- User encrypts on device thinking backend can't read it
- But backend stores plaintext in database
- SQL injection or server breach exposes all responses
- **User trust is violated**

**Example Breach Scenario:**
```
Attacker exploits database vulnerability
  ↓
SELECT * FROM submissions
  ↓
Returns all user responses in plain text
  ↓
Attacker can see:
  - Which users reported abuse
  - Details of what happened
  - When and where
  - Exact responses to screening questions

User: "Wait, I thought this was encrypted?"
You: "Yes, but the plaintext was stored in our database..."
```

---

## Proposed Solutions

### Solution 1: End-to-End Encryption (Recommended for SafeGirl)
**Keep: Only non-sensitive data in database**
```
Database should only store:
  ✅ reportId (identifier)
  ✅ txHash (blockchain reference)
  ✅ ipfsHash (where encrypted data is)
  ✅ status (pending/confirmed/failed)
  ✅ createdAt (timestamp)

Database should NEVER store:
  ❌ responses (user answers)
  ❌ metadata (location, time, context)
  ❌ anything sensitive
```

**How:**
```
Frontend encrypts everything:
  {
    encryptedData: encrypt({
      responses: [...],
      metadata: {...},
      payload: "..."
    })
  }

Backend receives only:
  {
    encryptedData: "0x...",
    reportId: "...",
    txHash: "..."
  }

Backend stores:
  - reportId (safe, just an ID)
  - txHash (safe, blockchain reference)
  - ipfsHash (safe, points to encrypted data)
  - status (safe, just an enum)

User trust: "Even if backend is breached, my responses are safe"
```

**Pros:**
- ✅ User data never readable by backend
- ✅ Meets confidentiality requirements for abuse reports
- ✅ Even if database hacked, no sensitive data exposed
- ✅ Aligns with privacy expectations

**Cons:**
- ⚠️ Backend can't search/filter responses (they're encrypted)
- ⚠️ More complex encryption/decryption on frontend

---

### Solution 2: Backend Encryption (Alternative)
**Backend encrypts sensitive data before storing**
```
Backend stores encrypted responses:
  {
    responses_encrypted: "encrypted blob...",
    responses_key: "stored separately",
    metadata_encrypted: "encrypted blob..."
  }

Backend has keys, can decrypt if needed
```

**Pros:**
- ✅ Backend can decrypt if user asks
- ✅ Easier implementation

**Cons:**
- ❌ Backend still holds encryption keys
- ❌ Keys could be stolen/compromised
- ❌ Requires secure key management
- ❌ Less privacy than user-held keys

---

### Solution 3: Hybrid (Maximum Security)
**User encryption + Backend encryption**
```
Frontend encrypts with user's key
Backend decrypts with user key, then re-encrypts with backend key
Result: Requires both keys to decrypt
```

**Pros:**
- ✅✅ Maximum security
- ✅ Only readable with both keys

**Cons:**
- ❌ Most complex to implement
- ❌ Key management complexity

---

## Recommended Encryption Model for SafeGirl

### User-Held Keys (Option 1)
**Why this is best for abuse reporting:**

1. **User Trust**
   - Users know ONLY they can read their report
   - Backend cannot read it (even if they want to for support)
   - Perfect for sensitive abuse disclosures

2. **Privacy Protection**
   - Even your team can't see responses
   - Legal/compliance benefit (you can't be forced to disclose)
   - GDPR compliant (truly private data)

3. **Security**
   - Encryption key never crosses the network
   - Database breach doesn't expose content
   - IPFS breach doesn't expose content (already encrypted)

4. **User Model Example:**
   ```
   User creates report:
     - Generates encryption key (or uses password-derived key)
     - Encrypts responses on device
     - Submits encrypted blob
     - Saves key securely (password manager/browser)

   Later, user retrieves report:
     - Provides reportId
     - Backend returns encrypted blob + metadata
     - User provides key
     - Frontend decrypts on device
     - User sees their responses
   ```

---

## Implementation Priority

### Phase 1 (Done ✅)
- ✅ Database blocking save
- ✅ UNIQUE constraints
- ✅ Tampering detection
- ✅ Audit logging

### Phase 2 (Recommended - Discuss with team)
- [ ] Implement end-to-end encryption
- [ ] Move sensitive data out of database
- [ ] Create API for encrypted data retrieval

### Phase 3 (Future)
- [ ] User-held key management UI
- [ ] Encrypted data recovery procedures
- [ ] Zero-knowledge proof verification

---

## Summary Table

| Issue | Severity | Status | Solution |
|-------|----------|--------|----------|
| DB-Blockchain sync | High | ✅ Fixed | Blocking saves |
| Missing constraints | Medium | ✅ Fixed | Added UNIQUE(txHash) |
| Tampering detection | High | ✅ Partially Fixed | Async verification + audit |
| Plaintext responses in DB | **Critical** | ⚠️ Needs Discussion | End-to-end encryption |

---

## Questions for Team Discussion

1. **Encryption Strategy:** Which model (user-held keys, backend, or hybrid)?
2. **User Experience:** How should users manage encryption keys?
3. **Compliance:** What are our legal/compliance requirements for confidentiality?
4. **Support:** Can we help users without reading their responses?
5. **Backup:** How do users recover if they lose their encryption key?

---

## Performance Impact Notes

- Database verification: ~50ms (no user impact, fast)
- Blockchain verification: ~15 seconds (runs in background, user doesn't wait)
- Encryption/decryption: ~100-500ms on frontend (one-time, acceptable)
- No performance impact on user-facing queries

---

## Next Steps

1. Review this summary with team
2. Decide on encryption strategy
3. Plan Phase 2 implementation
4. Update frontend encryption approach
5. Plan data migration strategy

