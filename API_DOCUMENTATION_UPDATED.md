# SafeGirl Backend API Documentation (Updated)

## Architecture: Database as Blockchain Cache

```
BLOCKCHAIN (Source of Truth - Immutable)
    ↓
BACKEND DATABASE (Read-Only Cache)
    ↓
FRONTEND (Local SQLite - Editable Drafts)
```

**Key Principle:** Once data hits the blockchain, backend database is **READ-ONLY**. No modifications allowed.

---

## Endpoints

### 1. Health Check
`GET /api/health` - Check service status

### 2. Submit Report
`POST /api/submitReport` - Submit report to IPFS and blockchain

### 3. Check Status
`GET /api/reportStatus?reportId=...` - Check blockchain confirmation

### 4. Archive Report
`POST /api/report/:reportId/archive` - Hide report (only non-destructive operation)

---

## Detailed Endpoints

### 1. Health Check

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-22T14:30:45.000Z",
  "backend": {
    "wallet": "0x1234567890abcdef...",
    "contract": "0x0987654321fedcba..."
  },
  "services": {
    "ipfs": "ready",
    "blockchain": "ready",
    "database": "connected"
  },
  "stats": {
    "total": 5,
    "pending": 2,
    "confirmed": 3,
    "failed": 0
  }
}
```

---

### 2. Submit Report

**Endpoint:** `POST /api/submitReport`

**Description:** Submit encrypted report to IPFS and blockchain

**Request:**
```json
{
  "encryptedPayload": "0xabcd1234...",
  "responses": [
    "User's text description"
  ],
  "metadata": {
    "location": "Nairobi, Kenya",
    "type": "text|audio|mixed",
    "audioDuration": 45000,
    "timestamp": "2024-01-22T14:30:00Z"
  }
}
```

**Response (200 - Success):**
```json
{
  "success": true,
  "reportId": "report_1674332400_abc123",
  "txHash": "0x1234567890abcdef...",
  "ipfsHash": "QmXYZ123abc456def...",
  "status": "pending",
  "message": "Report submitted successfully",
  "data": {
    "reportId": "report_1674332400_abc123",
    "txHash": "0x1234567890abcdef...",
    "ipfsHash": "QmXYZ123abc456def...",
    "blockNumber": 12345678,
    "gasUsed": "150000",
    "timestamp": "2024-01-22T14:30:45.000Z",
    "dbId": 1
  }
}
```

**Response (400 - Validation Error):**
```json
{
  "error": true,
  "message": "Missing field: encryptedPayload"
}
```

**Response (503 - IPFS Error):**
```json
{
  "error": true,
  "reportId": "report_1674332400_abc123",
  "message": "Failed to upload to IPFS. Please try again.",
  "code": "IPFS_ERROR"
}
```

---

### 3. Check Report Status

**Endpoint:** `GET /api/reportStatus?reportId=<reportId>`

**Description:** Check blockchain confirmation status (database is read-only after submission)

**Request:**
```
GET /api/reportStatus?reportId=report_1674332400_abc123
```

**Response (200 - Pending):**
```json
{
  "success": true,
  "reportId": "report_1674332400_abc123",
  "status": "pending",
  "message": "Report status: pending",
  "data": {
    "reportId": "report_1674332400_abc123",
    "status": "pending",
    "txHash": "0x1234567890abcdef...",
    "ipfsHash": "QmXYZ123abc456def...",
    "blockNumber": 12345678,
    "confirmations": 3,
    "createdAt": "2024-01-22T14:30:45Z",
    "confirmedAt": null
  }
}
```

**Response (200 - Confirmed):**
```json
{
  "success": true,
  "reportId": "report_1674332400_abc123",
  "status": "confirmed",
  "message": "Report status: confirmed",
  "data": {
    "reportId": "report_1674332400_abc123",
    "status": "confirmed",
    "txHash": "0x1234567890abcdef...",
    "ipfsHash": "QmXYZ123abc456def...",
    "blockNumber": 12345678,
    "confirmations": 12,
    "createdAt": "2024-01-22T14:30:45Z",
    "confirmedAt": "2024-01-22T14:35:00Z"
  }
}
```

**Response (404 - Not Found):**
```json
{
  "error": true,
  "reportId": "report_1674332400_abc123",
  "message": "Report not found"
}
```

---

### 4. Archive Report

**Endpoint:** `POST /api/report/:reportId/archive`

**Description:** Archive report (hide from list, does NOT modify blockchain data)

**Important:** This is the ONLY modification allowed after blockchain submission

**Request:**
```json
POST /api/report/report_1674332400_abc123/archive
Content-Type: application/json

{
  "reason": "User requested privacy"
}
```

**Response (200 - Success):**
```json
{
  "success": true,
  "message": "Report archived successfully (still on blockchain)",
  "data": {
    "reportId": "report_1674332400_abc123",
    "status": "confirmed",
    "isArchived": true,
    "archivedAt": "2024-01-22T16:00:00Z",
    "archivedReason": "User requested privacy"
  }
}
```

**Response (404 - Not Found):**
```json
{
  "error": true,
  "message": "Report not found"
}
```

**Constraints:**
- ✅ Can archive any status (pending, confirmed)
- ❌ Does NOT delete blockchain record
- ❌ Does NOT modify data
- ✅ Only hides from lists
- ✅ Can still view if you know reportId

---

## Important: Database is READ-ONLY

**Once submitted to blockchain:**

| Operation | Allowed? |
|-----------|----------|
| Read data | ✅ YES |
| Archive | ✅ YES (only non-destructive) |
| Update | ❌ NO (would break blockchain link) |
| Delete | ❌ NO (would break blockchain link) |
| Modify | ❌ NO (blockchain is source of truth) |

**Why?** Because:
```
Blockchain: Report hash = 0x1234...
Database: Modified report hash = 0x5678...
Result: ⚠️ MISMATCH - Data integrity broken!
```

---

## Draft Editing

**Draft reports (before submission) are handled on FRONTEND:**

Use your local SQLite (`salama-ui/services/storage.ts`):
```typescript
deleteReport(id)        // Delete draft
updateReportStatus(id)  // Update draft
saveReport(report)      // Edit draft
```

The backend DOES NOT handle draft editing - that's the frontend's responsibility.

---

## Data Flow

```
User creates report
    ↓
Save to LOCAL SQLite (frontend)
    ├─ Can edit ✓
    ├─ Can delete ✓
    └─ Can update ✓
    ↓
User submits
    ↓
POST /api/submitReport
    ↓
Backend:
  ├─ Upload to IPFS
  ├─ Write to blockchain
  └─ Store in database (cache)
    ↓
GET /api/reportStatus
    ↓
Backend database becomes READ-ONLY
    ├─ Can view ✓
    ├─ Can archive ✓
    └─ Can NOT modify ✗
```

---

## Examples

### cURL: Submit Report
```bash
curl -X POST http://localhost:3001/api/submitReport \
  -H "Content-Type: application/json" \
  -d '{
    "encryptedPayload": "0x...",
    "responses": ["User report text"],
    "metadata": {"location": "Nairobi", "type": "text"}
  }'
```

### cURL: Check Status
```bash
curl "http://localhost:3001/api/reportStatus?reportId=report_..."
```

### cURL: Archive Report
```bash
curl -X POST http://localhost:3001/api/report/report_.../archive \
  -H "Content-Type: application/json" \
  -d '{"reason": "User requested privacy"}'
```

---

## Error Codes

| Code | Meaning | HTTP Status |
|------|---------|-------------|
| `VALIDATION_ERROR` | Invalid input | 400 |
| `NOT_FOUND` | Report doesn't exist | 404 |
| `IPFS_ERROR` | IPFS upload failed | 503 |
| `BLOCKCHAIN_ERROR` | Contract call failed | 500 |
| `DB_SYNC_FAILED` | Database sync issue | 500 |

---

## Key Takeaway

```
🔒 BLOCKCHAIN = Immutable Source of Truth
📋 DATABASE = Read-Only Cache for fast queries
📱 FRONTEND = Editable drafts before submission

Database changes AFTER submission = Breaking blockchain link
```

