# SafeGirl Backend API Documentation

## Overview

Complete API reference for SafeGirlCore backend. All endpoints handle encrypted data and blockchain integration.

---

## Base URL

```
Development: http://localhost:3001
Production: https://api.safegirl.com (or your domain)
```

---

## Authentication

Currently: No authentication required (can be added with JWT)

Future: Add Bearer token for user authentication

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 202 | Accepted (processing) |
| 400 | Bad Request (validation error) |
| 403 | Forbidden (immutable/permission denied) |
| 404 | Not Found |
| 500 | Server Error |
| 503 | Service Unavailable (IPFS/Blockchain down) |

---

## Endpoints

### 1. Health Check

**Endpoint:** `GET /api/health`

**Description:** Check backend health and service status

**Request:**
```
GET /api/health
```

**Response (200):**
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

**Response (503 - Degraded):**
```json
{
  "status": "degraded",
  "timestamp": "2024-01-22T14:30:45.000Z",
  "services": {
    "database": "error"
  }
}
```

---

### 2. Submit Report

**Endpoint:** `POST /api/submitReport`

**Description:** Submit a new report to IPFS and blockchain

**Request:**
```json
{
  "encryptedPayload": "0xabcd1234...",
  "responses": [
    "Response 1",
    "Response 2",
    "Response 3"
  ],
  "metadata": {
    "location": "Nairobi, Kenya",
    "timestamp": "2024-01-22T14:30:00Z",
    "deviceInfo": "iPhone 13",
    "type": "text|audio|mixed"
  }
}
```

**Validation Rules:**
- `encryptedPayload`: Required, string or hex
- `responses`: Optional, array of strings, each ≤1000 characters (any number)
- `metadata`: Optional, any object (location, mood, type, etc)

**Response (200 - Success):**
```json
{
  "success": true,
  "reportId": "report_1674332400_abc123",
  "txHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "ipfsHash": "QmXYZ123abc456def789ghi000jkl111mno222pqr333stu",
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
  "message": "Payload exceeds maximum size of 50MB",
  "code": "VALIDATION_ERROR"
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

**Description:** Check submission status and blockchain confirmations

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
    "confirmedAt": null,
    "gasUsed": "150000"
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
    "confirmedAt": "2024-01-22T14:35:00Z",
    "gasUsed": "150000"
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

### 4. Delete Report (DRAFT ONLY)

**Endpoint:** `DELETE /api/report/:reportId`

**Description:** Delete a draft report (only unsent reports)

**Request:**
```
DELETE /api/report/report_1674332400_abc123
```

**Response (200 - Success):**
```json
{
  "success": true,
  "message": "Report deleted successfully",
  "data": {
    "reportId": "report_1674332400_abc123",
    "deleted": true
  }
}
```

**Response (403 - Immutable):**
```json
{
  "error": true,
  "code": "IMMUTABLE",
  "message": "Cannot delete reports recorded on blockchain (immutable)",
  "data": {
    "reportId": "report_1674332400_abc123",
    "status": "confirmed"
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
- ❌ Cannot delete if `status` is `'submitted'` or `'confirmed'`
- ✅ Can only delete draft reports
- ⚠️ Deletion is permanent and logged in audit trail

---

### 5. Update Report (DRAFT ONLY)

**Endpoint:** `PATCH /api/report/:reportId`

**Description:** Update responses or metadata (only unsent reports)

**Request:**
```json
PATCH /api/report/report_1674332400_abc123
Content-Type: application/json

{
  "responses": [
    "Updated text response",
    "Updated second response"
  ],
  "metadata": {
    "location": "Updated location",
    "mood": "sad",
    "type": "text"
  }
}
```

**Response (200 - Success):**
```json
{
  "success": true,
  "message": "Report updated successfully",
  "data": {
    "reportId": "report_1674332400_abc123",
    "status": "draft",
    "updatedAt": "2024-01-22T15:30:00Z",
    "responses": [
      "Updated text response",
      "Updated second response"
    ],
    "metadata": {
      "location": "Updated location",
      "mood": "sad",
      "type": "text"
    }
  }
}
```

**Response (403 - Immutable):**
```json
{
  "error": true,
  "code": "IMMUTABLE",
  "message": "Cannot modify reports recorded on blockchain (immutable)",
  "data": {
    "reportId": "report_1674332400_abc123",
    "status": "confirmed"
  }
}
```

**Response (400 - Validation Error):**
```json
{
  "error": true,
  "message": "Response 0 exceeds 1000 character limit"
}
```

**Constraints:**
- ❌ Cannot update if `status` is `'submitted'` or `'confirmed'`
- ✅ Can only update draft reports
- ⚠️ All changes are logged in audit trail

---

### 6. Archive Report

**Endpoint:** `POST /api/report/:reportId/archive`

**Description:** Archive a report (hide from list, keep blockchain record)

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
- ✅ Can archive ANY status (draft, submitted, confirmed)
- ❌ Archived reports are hidden from lists
- ✅ Can still view details if you know reportId
- ⚠️ Blockchain record remains unchanged (immutable)

---

## Status Values

```
'draft'       - Not yet submitted to backend
'submitted'   - Submitted, waiting for blockchain confirmation
'pending'     - On blockchain, waiting for confirmations (0-11)
'confirmed'   - On blockchain with 12+ confirmations ✓
'failed'      - Submission failed at some point
```

---

## Error Codes

| Code | Meaning | HTTP Status |
|------|---------|-------------|
| `VALIDATION_ERROR` | Invalid input | 400 |
| `NOT_FOUND` | Report doesn't exist | 404 |
| `IMMUTABLE` | Cannot modify blockchain record | 403 |
| `IPFS_ERROR` | IPFS upload failed | 503 |
| `BLOCKCHAIN_ERROR` | Smart contract call failed | 500 |
| `DB_SYNC_FAILED` | Database sync issue | 500 |
| `DELETE_ERROR` | Delete operation failed | 500 |
| `UPDATE_ERROR` | Update operation failed | 500 |
| `ARCHIVE_ERROR` | Archive operation failed | 500 |

---

## Request/Response Flow

```
User Action              API Endpoint                Result
─────────────────────────────────────────────────────────────
Create draft        →    (Local storage only)    Draft saved locally
Submit report       →    POST /submitReport      Blockchain submission
Check status        →    GET /reportStatus       Status + confirmations
Update draft        →    PATCH /report/:id       Update if not sent
Delete draft        →    DELETE /report/:id      Delete if not sent
Archive report      →    POST /report/:id/archive  Hide from list
```

---

## Rate Limiting

Currently: No rate limiting (can be added)

Recommended limits (future):
- 10 submissions per minute per user
- 100 status checks per minute per user
- 50 updates per minute per user

---

## Encryption

### Frontend Encryption
- Handled on client side before sending to backend
- Use TweetNaCl.js or libsodium.js
- Encrypt entire payload before `POST /api/submitReport`

### Backend Encryption
- Responses and metadata encrypted at rest
- Uses userId-derived key (AES-256-CBC)
- Automatically decrypted when retrieved

---

## Example Client Code

### Submit Report (JavaScript)
```javascript
async function submitReport(responses, metadata) {
  // 1. Encrypt on frontend
  const encryptedPayload = await encryptData({
    responses,
    metadata,
    timestamp: new Date().toISOString()
  });

  // 2. Send to backend
  const res = await fetch('http://localhost:3001/api/submitReport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      encryptedPayload,
      responses,
      metadata
    })
  });

  const data = await res.json();

  if (data.success) {
    console.log('Report submitted:', data.reportId);
    return data.reportId;
  } else {
    throw new Error(data.message);
  }
}
```

### Check Status
```javascript
async function checkStatus(reportId) {
  const res = await fetch(
    `http://localhost:3001/api/reportStatus?reportId=${reportId}`
  );
  const data = await res.json();

  if (data.success) {
    console.log('Status:', data.data.status);
    console.log('Confirmations:', data.data.confirmations);
    return data.data;
  }
}
```

### Update Report
```javascript
async function updateReport(reportId, newResponses) {
  const res = await fetch(
    `http://localhost:3001/api/report/${reportId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        responses: newResponses
      })
    }
  );

  const data = await res.json();
  if (data.success) {
    console.log('Report updated');
  }
}
```

### Delete Report
```javascript
async function deleteReport(reportId) {
  const res = await fetch(
    `http://localhost:3001/api/report/${reportId}`,
    { method: 'DELETE' }
  );

  const data = await res.json();
  if (data.success) {
    console.log('Report deleted');
  } else if (data.code === 'IMMUTABLE') {
    console.error('Cannot delete - report on blockchain');
  }
}
```

### Archive Report
```javascript
async function archiveReport(reportId, reason) {
  const res = await fetch(
    `http://localhost:3001/api/report/${reportId}/archive`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    }
  );

  const data = await res.json();
  if (data.success) {
    console.log('Report archived');
  }
}
```

---

## Testing

### Using cURL

**Health Check:**
```bash
curl http://localhost:3001/api/health
```

**Submit Report:**
```bash
curl -X POST http://localhost:3001/api/submitReport \
  -H "Content-Type: application/json" \
  -d '{
    "encryptedPayload": "0x...",
    "responses": ["User text response"],
    "metadata": {"location": "Nairobi", "type": "text"}
  }'
```

**Check Status:**
```bash
curl "http://localhost:3001/api/reportStatus?reportId=report_..."
```

**Update Report:**
```bash
curl -X PATCH http://localhost:3001/api/report/report_... \
  -H "Content-Type: application/json" \
  -d '{
    "responses": ["Updated user text"],
    "metadata": {"location": "Nairobi", "mood": "anxious"}
  }'
```

**Delete Report:**
```bash
curl -X DELETE http://localhost:3001/api/report/report_...
```

**Archive Report:**
```bash
curl -X POST http://localhost:3001/api/report/report_.../archive \
  -H "Content-Type: application/json" \
  -d '{"reason": "User requested privacy"}'
```

---

## Security Notes

1. **Encryption** - Always encrypt sensitive data on frontend before sending
2. **HTTPS** - Use HTTPS in production
3. **Validation** - All inputs validated on backend
4. **Immutability** - Once on blockchain, data cannot be modified
5. **Audit Trail** - All changes logged and can be audited
6. **Blockchain Truth** - Blockchain is source of truth for submitted reports

---

## Support

For issues or questions:
- Check `/health` endpoint for service status
- Review error code and message
- Check logs: `docker logs safegirl-backend`
- Contact: support@safegirl.com

