# SafeGirl Backend - API Reference for Frontend Integration

**Base URL:** `http://localhost:3001/api`

---

## **Authentication (11 Endpoints)**

### 1. Signup - Step 1: Initiate
**POST** `/auth/signup/initiate`
```json
Request:
{
  "phone": "+254712345678",
  "email": "user@example.com"
}

Response (200):
{
  "success": true,
  "message": "OTP sent to phone",
  "data": {
    "phone": "+254712345678",
    "expiresIn": 300
  }
}
```

### 2. Signup - Step 2: Verify OTP
**POST** `/auth/signup/verify`
```json
Request:
{
  "phone": "+254712345678",
  "otp": "123456"
}

Response (200):
{
  "success": true,
  "message": "Signup successful",
  "data": {
    "userId": "user_123",
    "token": "eyJhbGc...",
    "phone": "+254712345678",
    "email": "user@example.com"
  }
}
```

### 3. Login - Step 1: Initiate
**POST** `/auth/login/initiate`
```json
Request:
{
  "phone": "+254712345678"
}

Response (200):
{
  "success": true,
  "message": "OTP sent to phone",
  "data": {
    "phone": "+254712345678",
    "expiresIn": 300
  }
}
```

### 4. Login - Step 2: Verify OTP
**POST** `/auth/login/verify`
```json
Request:
{
  "phone": "+254712345678",
  "otp": "123456"
}

Response (200):
{
  "success": true,
  "message": "Login successful",
  "data": {
    "userId": "user_123",
    "token": "eyJhbGc...",
    "phone": "+254712345678"
  }
}
```

### 5. Forgot Phone - Step 1: Send Email Token
**POST** `/auth/forgot-phone`
```json
Request:
{
  "email": "user@example.com"
}

Response (200):
{
  "success": true,
  "message": "Recovery email sent",
  "data": {
    "email": "user@example.com",
    "expiresIn": 3600
  }
}
```

### 6. Recovery - Step 2: Verify Email Token
**POST** `/auth/verify-recovery`
```json
Request:
{
  "email": "user@example.com",
  "token": "token_from_email"
}

Response (200):
{
  "success": true,
  "message": "Email verified, proceed to change phone",
  "data": {
    "userId": "user_123"
  }
}
```

### 7. Change Phone - Step 3: Send OTP
**POST** `/auth/change-phone/recovery`
```json
Request:
{
  "email": "user@example.com",
  "newPhone": "+254798765432"
}

Response (200):
{
  "success": true,
  "message": "OTP sent to new phone"
}
```

### 8. Verify Phone Change - Step 4: Verify OTP
**POST** `/auth/verify-phone-change/recovery`
```json
Request:
{
  "email": "user@example.com",
  "newPhone": "+254798765432",
  "otp": "123456"
}

Response (200):
{
  "success": true,
  "message": "Phone changed successfully",
  "data": {
    "userId": "user_123",
    "token": "eyJhbGc...",
    "phone": "+254798765432"
  }
}
```

### 9. Change Phone (Authenticated User)
**POST** `/auth/change-phone` (protected)
```json
Request:
{
  "newPhone": "+254798765432"
}

Response (200):
{
  "success": true,
  "message": "OTP sent to new phone"
}

Headers:
{
  "Authorization": "Bearer eyJhbGc..."
}
```

### 10. Verify Phone Change (Authenticated User)
**POST** `/auth/verify-phone-change` (protected)
```json
Request:
{
  "newPhone": "+254798765432",
  "otp": "123456"
}

Response (200):
{
  "success": true,
  "message": "Phone changed successfully",
  "data": {
    "userId": "user_123",
    "token": "eyJhbGc...",
    "phone": "+254798765432"
  }
}

Headers:
{
  "Authorization": "Bearer eyJhbGc..."
}
```

### 11. Verify Token
**GET** `/auth/verify` (protected)
```
Headers:
{
  "Authorization": "Bearer eyJhbGc..."
}

Response (200):
{
  "success": true,
  "data": {
    "userId": "user_123",
    "phone": "+254712345678"
  }
}
```

---

## **Reports (5 Endpoints)**

### 1. Submit Report
**POST** `/submitReport`
```json
Request (protected):
{
  "payload": {
    "text": "User's written response",
    "audio": "base64_audio_data",
    "other": "any additional data"
  },
  "responses": [
    "answer to question 1",
    "answer to question 2",
    "answer to question 3",
    "answer to question 4",
    "answer to question 5"
  ],
  "metadata": {
    "location": "Nairobi",
    "timestamp": "2026-02-16T15:30:00Z"
  }
}

Response (200):
{
  "success": true,
  "reportId": "report_1234567890_abc123",
  "txHash": "0x123...",
  "ipfsHash": "QmXyz...",
  "status": "pending",
  "data": {
    "reportId": "report_1234567890_abc123",
    "txHash": "0x123...",
    "ipfsHash": "QmXyz...",
    "blockNumber": 12345,
    "gasUsed": "150000",
    "timestamp": "2026-02-16T15:30:00Z"
  }
}
```

### 2. Check Report Status
**GET** `/reportStatus?reportId=report_1234567890_abc123`
```
Response (200):
{
  "success": true,
  "data": {
    "reportId": "report_1234567890_abc123",
    "status": "confirmed",
    "txHash": "0x123...",
    "blockNumber": 12345,
    "confirmedAt": "2026-02-16T15:32:00Z"
  }
}
```

### 3. Archive Report
**POST** `/report/:reportId/archive` (protected)
```json
Request:
{
  "reason": "User requested deletion"
}

Response (200):
{
  "success": true,
  "message": "Report archived"
}
```

### 4. Decrypt Report
**GET** `/report/:reportId/decrypt` (protected)
```
Response (200):
{
  "success": true,
  "data": {
    "reportId": "report_1234567890_abc123",
    "status": "confirmed",
    "payload": {
      "text": "User's written response",
      "audio": "base64_audio_data"
    },
    "responses": ["answer1", "answer2", ...],
    "metadata": {...},
    "createdAt": "2026-02-16T15:30:00Z"
  }
}
```

### 5. Health Check
**GET** `/health`
```
Response (200):
{
  "status": "healthy",
  "database": "connected",
  "blockchain": "connected",
  "ipfs": "ready"
}
```

---

## **Access/Sharing (5 Endpoints)**

### 1. Grant Access
**POST** `/access/grant` (protected)
```json
Request:
{
  "reportId": "report_1234567890_abc123",
  "grantToUserId": "user_456",
  "expiresIn": 2592000
}

Response (200):
{
  "success": true,
  "data": {
    "reportId": "report_1234567890_abc123",
    "grantedTo": "user_456",
    "expiresAt": "2026-03-18T15:30:00Z",
    "txHash": "0xabc..."
  }
}
```

### 2. Revoke Access
**POST** `/access/revoke` (protected)
```json
Request:
{
  "reportId": "report_1234567890_abc123",
  "revokeFromUserId": "user_456"
}

Response (200):
{
  "success": true,
  "data": {
    "reportId": "report_1234567890_abc123",
    "revokedFrom": "user_456",
    "txHash": "0xdef..."
  }
}
```

### 3. Get Reports Shared With Me
**GET** `/access/shared-with-me` (protected)
```
Response (200):
{
  "success": true,
  "data": {
    "sharedReports": [
      {
        "reportId": "report_123",
        "reporterId": "user_789",
        "grantedAt": "2026-02-16T15:30:00Z",
        "expiresAt": "2026-03-18T15:30:00Z",
        "isActive": true
      }
    ]
  }
}
```

### 4. Get Viewers of My Report
**GET** `/access/my-report/:reportId/viewers` (protected)
```
Response (200):
{
  "success": true,
  "data": {
    "reportId": "report_123",
    "viewers": [
      {
        "viewerId": "user_456",
        "grantedAt": "2026-02-16T15:30:00Z",
        "expiresAt": "2026-03-18T15:30:00Z",
        "isActive": true
      }
    ]
  }
}
```

### 5. View Shared Report
**GET** `/access/report/:reportId` (protected)
```
Response (200):
{
  "success": true,
  "data": {
    "reportId": "report_123",
    "status": "confirmed",
    "txHash": "0x123...",
    "ipfsHash": "QmXyz...",
    "responses": ["answer1", "answer2", ...],
    "metadata": {...},
    "createdAt": "2026-02-16T15:30:00Z"
  }
}
```

---

## **Panic Alerts (2 Endpoints)**

### 1. Send Panic Alert
**POST** `/panic-alert` (protected, rate limited 10/min)
```json
Request:
{
  "locationData": "GPS: -1.2921, 36.8219 or Address: Nairobi, Kenya"
}

Response (200):
{
  "success": true,
  "data": {
    "alertId": 1,
    "txHash": "0x789...",
    "timestamp": "2026-02-16T15:30:00Z"
  }
}
```

### 2. Get Panic Alert History
**GET** `/panic-alert/history` (protected)
```
Query: ?limit=10&offset=0

Response (200):
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": 1,
        "locationData": "GPS: -1.2921, 36.8219",
        "txHash": "0x789...",
        "blockNumber": 12345,
        "createdAt": "2026-02-16T15:30:00Z"
      }
    ]
  }
}
```

---

## **Key Recovery (2 Endpoints)**

### 1. Backup Encryption Key With PIN
**POST** `/keys/backup` (protected)
```json
Request:
{
  "pin": "1234",
  "encryptionKey": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}

Response (200):
{
  "success": true,
  "data": {
    "backupId": 1,
    "backupCreatedAt": "2026-02-16T15:30:00Z",
    "reminder": "Save your PIN in a safe place"
  }
}
```

### 2. Recover Key With PIN
**POST** `/keys/recover` (rate limited 5/15min)
```json
Request:
{
  "phone": "+254712345678",
  "pin": "1234"
}

Response (200):
{
  "success": true,
  "data": {
    "encryptionKey": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "reminder": "Use this key to decrypt your reports"
  }
}
```

---

## **Search & Filtering (2 Endpoints)**

### 1. Search Reports
**GET** `/search/reports` (protected)
```
Query params:
- status: pending, confirmed, failed, archived
- createdAfter: 2026-02-01T00:00:00Z (ISO date)
- createdBefore: 2026-02-28T23:59:59Z (ISO date)
- limit: 10 (max 100)
- offset: 0

Example: /search/reports?status=confirmed&limit=20&offset=0

Response (200):
{
  "success": true,
  "data": {
    "reports": [
      {
        "reportId": "report_123",
        "status": "confirmed",
        "createdAt": "2026-02-16T15:30:00Z",
        "confirmedAt": "2026-02-16T15:32:00Z",
        "txHash": "0x123...",
        "ipfsHash": "QmXyz..."
      }
    ],
    "pagination": {
      "total": 45,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

### 2. Get Report Statistics
**GET** `/search/stats` (protected)
```
Response (200):
{
  "success": true,
  "data": {
    "totalReports": 50,
    "pending": 5,
    "confirmed": 40,
    "failed": 2,
    "archived": 3,
    "sharedWithMe": 8
  }
}
```

---

## **Notifications (5 Endpoints)**

### 1. Get Notifications
**GET** `/notifications` (protected)
```
Query params:
- isRead: true/false
- type: access_granted, panic_alert, report_submitted
- limit: 20 (max 100)
- offset: 0

Example: /notifications?isRead=false&limit=20

Response (200):
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": 1,
        "type": "access_granted",
        "title": "Report Access",
        "message": "User user_456 has been granted access",
        "relatedId": "report_123",
        "isRead": false,
        "createdAt": "2026-02-16T15:30:00Z",
        "readAt": null
      }
    ],
    "pagination": {
      "total": 15,
      "limit": 20,
      "offset": 0,
      "unreadCount": 5
    }
  }
}
```

### 2. Get Unread Count
**GET** `/notifications/unread/count` (protected)
```
Response (200):
{
  "success": true,
  "data": {
    "unreadCount": 5
  }
}
```

### 3. Mark Notification As Read
**POST** `/notifications/:notificationId/read` (protected)
```
Response (200):
{
  "success": true,
  "data": {
    "notificationId": 1,
    "isRead": true,
    "readAt": "2026-02-16T15:35:00Z"
  }
}
```

### 4. Mark All As Read
**POST** `/notifications/mark-all-read` (protected)
```
Response (200):
{
  "success": true,
  "data": {
    "marked": 5
  }
}
```

### 5. Delete Notification
**DELETE** `/notifications/:notificationId` (protected)
```
Response (200):
{
  "success": true,
  "message": "Notification deleted"
}
```

---

## **HTTP Headers (For All Protected Routes)**

```json
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "Content-Type": "application/json"
}
```

---

## **Error Response Format**

```json
{
  "error": true,
  "message": "Descriptive error message",
  "code": "ERROR_CODE"
}
```

### Common HTTP Status Codes:
- **200** - Success
- **400** - Bad request (validation error)
- **401** - Unauthorized (missing/invalid token)
- **403** - Forbidden (no permission)
- **404** - Not found
- **429** - Too many requests (rate limited)
- **500** - Server error

---

## **Rate Limits**

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/signup/initiate` | 5 | 15 min |
| `/auth/signup/verify` | 5 | 15 min |
| `/auth/login/initiate` | 5 | 15 min |
| `/auth/login/verify` | 5 | 15 min |
| `/panic-alert` | 10 | 1 min |
| `/keys/recover` | 5 | 15 min |

---

## **Frontend Integration Checklist**

- [ ] Handle JWT token storage and refresh
- [ ] Add `Authorization` header to all protected requests
- [ ] Parse error responses and show user-friendly messages
- [ ] Implement pagination for list endpoints
- [ ] Cache unread notification count
- [ ] Handle rate limit 429 errors gracefully
- [ ] Use ISO 8601 format for all dates
- [ ] Encrypt payload before sending (optional: frontend can send plain JSON)
- [ ] Handle pending transaction states
- [ ] Implement real-time panic alert notifications (WebSocket optional)

---

**Last Updated:** 2026-02-16
