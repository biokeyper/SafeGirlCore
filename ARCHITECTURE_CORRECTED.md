# Corrected Architecture: Database as Blockchain Cache

## The Problem

We initially added DELETE and UPDATE endpoints for the backend database, but this breaks blockchain integrity:

```
❌ WRONG:
Blockchain: Report data hash = 0x1234...
User modifies data on backend
Database: New data hash = 0x5678...
Result: Database no longer matches blockchain! ⚠️
```

---

## The Solution

Backend database is a **READ-ONLY CACHE** of the blockchain. Once data is on blockchain, it cannot be modified on the database.

```
✅ CORRECT:
Blockchain (Source of Truth)
    ↓ [Immutable]
Backend Database (Cache)
    ↓ [Read-only mirror]
Fast queries for status, stats, etc.
```

---

## Three Layers

### Layer 1: Frontend (salama-ui)
```
Local SQLite (on user's phone)
├─ User's draft reports
├─ Editable (can change/delete)
├─ Not submitted yet
└─ User controls entirely
```

**Endpoints:** None - handled locally by frontend
```typescript
saveReport()        // Save draft
deleteReport()      // Delete draft
updateReportStatus() // Edit draft
```

---

### Layer 2: Backend Database (PostgreSQL)
```
Database (on server)
├─ Only stores SUBMITTED reports
├─ Mirror of blockchain
├─ Read-only for submitted reports
└─ Cannot be modified
```

**Endpoints:**
- ✅ `POST /api/submitReport` - Insert new (one-time)
- ✅ `GET /api/reportStatus` - Read status
- ✅ `POST /api/report/:id/archive` - Archive (non-destructive)
- ❌ `DELETE /api/report/:id` - REMOVED (immutable)
- ❌ `PATCH /api/report/:id` - REMOVED (immutable)

---

### Layer 3: Blockchain (Polygon)
```
Smart Contract (on chain)
├─ Immutable permanent record
├─ Hash + CID stored
├─ Source of truth
└─ Verified by network
```

**Once data hits blockchain:**
- ❌ Cannot delete
- ❌ Cannot modify
- ✅ Can verify
- ✅ Can read

---

## Data Lifecycle

```
┌──────────────────────────────────────────────┐
│ DRAFT PHASE (Frontend only)                  │
├──────────────────────────────────────────────┤
│ User creates report                          │
│ Saved to LOCAL SQLite                        │
│                                              │
│ Can DELETE: ✓                                │
│ Can UPDATE: ✓                                │
│ On Blockchain: ✗                            │
└──────────────────────────────────────────────┘
            ↓ [User clicks Submit]
┌──────────────────────────────────────────────┐
│ SUBMITTED PHASE (Backend + Blockchain)       │
├──────────────────────────────────────────────┤
│ Encrypted → IPFS → Blockchain                │
│ Stored in Backend DB (cache)                 │
│                                              │
│ Can DELETE: ✗ (REMOVED)                     │
│ Can UPDATE: ✗ (REMOVED)                     │
│ Can ARCHIVE: ✓ (non-destructive)            │
│ Can READ: ✓                                 │
│ On Blockchain: ✓                            │
└──────────────────────────────────────────────┘
            ↓ [Blockchain confirms]
┌──────────────────────────────────────────────┐
│ CONFIRMED PHASE (Immutable)                  │
├──────────────────────────────────────────────┤
│ On blockchain with 12+ confirmations         │
│ Database matches blockchain                  │
│                                              │
│ Can DELETE: ✗ (immutable)                   │
│ Can UPDATE: ✗ (immutable)                   │
│ Can ARCHIVE: ✓ (hide only)                  │
│ Can READ: ✓                                 │
│ Permanent: ✓                                │
└──────────────────────────────────────────────┘
```

---

## Operations by Layer

### Frontend Only (Local SQLite)
```typescript
// In salama-ui/services/storage.ts
saveReport(report)              // ✓ Create
deleteReport(id)                // ✓ Delete drafts
updateReportStatus(id, status)  // ✓ Update drafts
getReportById(id)               // ✓ Read
```

### Backend API
```
POST /api/submitReport          ✓ Submit (one-time)
GET /api/reportStatus           ✓ Check blockchain
POST /api/report/:id/archive    ✓ Archive (non-destructive)
DELETE /api/report/:id          ✗ REMOVED
PATCH /api/report/:id           ✗ REMOVED
```

### Blockchain (Smart Contract)
```
submitReport(hash, cid)         ✓ Record once
getReport(hash)                 ✓ Read
```

---

## Why We Removed DELETE and UPDATE

### Before (Wrong)
```javascript
DELETE /api/report/:id
├─ Delete from backend database
├─ Breaks blockchain link
└─ Database no longer matches blockchain ⚠️
```

### After (Correct)
```javascript
// No DELETE endpoint for submitted reports
// Blockchain is source of truth
// Database cannot be modified
```

### Only Exception
```javascript
POST /api/report/:id/archive
├─ Does NOT delete data
├─ Does NOT modify data
├─ Only sets isArchived = true
└─ Blockchain record unchanged ✓
```

---

## Rule: Single Source of Truth

```
Once on blockchain:
  Database = Read-only mirror
  Database cannot change
  Blockchain is the boss
```

If you need to change a report:
1. Check if it's a DRAFT (not submitted)
   - YES: Use frontend local storage
   - NO: Cannot change (immutable)

---

## Frontend Integration (Correct)

```typescript
// salama-ui/services/api.ts

async function submitReportToBackend(localReport: Report) {
  // 1. User has draft in LOCAL SQLite
  // 2. User clicks "Submit"
  // 3. Send encrypted to backend

  const response = await fetch('/api/submitReport', {
    method: 'POST',
    body: JSON.stringify({
      encryptedPayload,
      responses,
      metadata
    })
  });

  // 4. Backend sends to blockchain
  // 5. Backend database mirrors blockchain
  // 6. Database becomes READ-ONLY

  // User cannot modify from now on
  // Only can:
  //   - Check status
  //   - Archive (hide)
  //   - Read data
}
```

---

## Summary

| Component | Editable? | Modifiable? | Deletable? |
|-----------|-----------|-------------|-----------|
| Local Draft (Frontend) | ✅ YES | ✅ YES | ✅ YES |
| Submitted (Database) | ❌ NO | ❌ NO | ❌ NO |
| Confirmed (Blockchain) | ❌ NO | ❌ NO | ❌ NO |

---

## This is Correct Because

1. **Blockchain is immutable** - Once recorded, cannot change
2. **Database mirrors blockchain** - Should not diverge
3. **User edits drafts locally** - Before submission
4. **Archive is safe** - Non-destructive, preserves data

---

## What We Changed

```diff
- DELETE /api/report/:id        (REMOVED - breaks blockchain link)
- PATCH /api/report/:id         (REMOVED - breaks blockchain link)
  POST /api/report/:id/archive  (KEPT - non-destructive)
```

Endpoints removed from:
- `backend/routes/reports.js`
- `backend/controllers/reportController.js`
- `backend/services/database.js`

---

## Verification

To verify this is correct:

```
1. Submit a report → Goes to blockchain
2. Try to delete it → Would break blockchain link
3. Archive it instead → Just hides, preserves blockchain
4. Check blockchain → Data still there, unchanged
```

This ensures data integrity and blockchain security.

