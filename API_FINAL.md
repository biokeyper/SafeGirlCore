# SafeGirl Backend API - Final Documentation

## Architecture Summary

```
Frontend sends plaintext over HTTPS
        ↓
Backend receives → Encrypts → Stores
        ↓
Database: Encrypted copy (cache)
IPFS: Encrypted blob
Blockchain: Immutable hash ✓
```

**Backend handles ALL encryption. Frontend sends plaintext.**

---

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/submitReport` | POST | Submit a report |
| `/api/reportStatus` | GET | Check blockchain status |
| `/api/report/:id/archive` | POST | Archive a report |
| `/api/health` | GET | Health check |

---

## 1. Submit Report

**POST** `/api/submitReport`

### Request

```json
{
  "responses": [
    "User's text response"
  ],
  "metadata": {
    "location": "Office, Nairobi",
    "mood": "anxious",
    "type": "text|audio|mixed",
    "audioDuration": 45000,
    "timestamp": "2024-01-22T14:30:00Z"
  }
}
```

### Response (200 - Success)

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

### Response (400 - Validation Error)

```json
{
  "error": true,
  "message": "responses must be an array"
}
```

### Response (503 - IPFS Error)

```json
{
  "error": true,
  "reportId": "report_1674332400_abc123",
  "message": "Failed to upload to IPFS. Please try again.",
  "code": "IPFS_ERROR"
}
```

### What Backend Does

```
1. Receive plaintext {responses, metadata}
2. Encrypt responses with backend key
3. Encrypt metadata with backend key
4. Upload encrypted to IPFS
5. Record hash on blockchain
6. Store in database (encrypted)
7. Return reportId for tracking
```

---

## 2. Check Report Status

**GET** `/api/reportStatus?reportId=report_1674332400_abc123`

### Response (200 - Pending)

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

### Response (200 - Confirmed)

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

### Response (404 - Not Found)

```json
{
  "error": true,
  "reportId": "report_1674332400_abc123",
  "message": "Report not found"
}
```

---

## 3. Archive Report

**POST** `/api/report/:reportId/archive`

### Request

```json
{
  "reason": "User requested privacy"
}
```

### Response (200 - Success)

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

**Note:** Archive only hides the report from lists. Data remains on blockchain.

---

## 4. Health Check

**GET** `/api/health`

### Response (200 - Healthy)

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

## Data Security

### What Backend Encrypts

```
✅ responses
✅ metadata
✅ Stored in database
✅ Stored in IPFS
```

### What Blockchain Stores

```
✅ Hash (immutable proof)
✅ IPFS CID (location)
✅ Timestamp
❌ Plaintext data
```

### Verification

```
If backend is hacked:
  Database: encrypted (useless without key)
  Blockchain: still has hash (proves integrity)

If blockchain hash ≠ database hash:
  → Tampering detected!
  → Blockchain is source of truth
```

---

## Frontend Responsibilities

✅ **DO:**
- Send plaintext responses over HTTPS
- Include all metadata
- Save reportId after submission
- Poll for status updates
- Handle errors gracefully

❌ **DON'T:**
- Encrypt data on frontend
- Manage encryption keys
- Send encryptedPayload
- Handle passwords
- Attempt to decrypt responses

---

## Encryption Flow

```
User Report
  ↓
Frontend sends plaintext (over HTTPS)
  ↓
Backend receives
  ├─ Encrypt responses
  ├─ Encrypt metadata
  └─ Encrypt for IPFS
  ↓
Storage
  ├─ Database: encrypted
  ├─ IPFS: encrypted blob
  └─ Blockchain: hash
  ↓
Verification
  └─ Compare blockchain hash against database
     (if match → integrity confirmed)
```

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Invalid input |
| `IPFS_ERROR` | 503 | IPFS upload failed |
| `BLOCKCHAIN_ERROR` | 500 | Smart contract failed |
| `DB_SYNC_FAILED` | 500 | Database sync issue |

---

## Example cURL Commands

### Submit Report

```bash
curl -X POST http://localhost:3001/api/submitReport \
  -H "Content-Type: application/json" \
  -d '{
    "responses": ["I was harassed at work"],
    "metadata": {
      "location": "Office",
      "mood": "anxious",
      "type": "text",
      "timestamp": "2024-01-22T14:30:00Z"
    }
  }'
```

### Check Status

```bash
curl "http://localhost:3001/api/reportStatus?reportId=report_1674332400_abc123"
```

### Archive Report

```bash
curl -X POST http://localhost:3001/api/report/report_1674332400_abc123/archive \
  -H "Content-Type: application/json" \
  -d '{"reason": "User requested privacy"}'
```

### Health Check

```bash
curl http://localhost:3001/api/health
```

---

## Summary

| Aspect | Details |
|--------|---------|
| **Frontend sends** | Plaintext (over HTTPS) |
| **Backend encrypts** | Responses + metadata |
| **Storage** | Encrypted in database |
| **IPFS** | Encrypted blob |
| **Blockchain** | Immutable hash |
| **Verification** | Compare blockchain vs database |
| **User password** | Not needed |
| **Key management** | Backend handles |

---

## Key Principle

```
Database = Cache of Blockchain
Blockchain = Source of Truth
Encryption = At rest (database)
Transport = HTTPS (in transit)
Verification = Hash comparison
```

