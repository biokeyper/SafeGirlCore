# Authentication Integration Guide

## Overview

The SafeGirl backend now has JWT-based authentication. Users must signup/login before submitting reports.

---

## Architecture

```
Frontend
  ↓
1. POST /api/auth/signup → Get JWT token
  OR
1. POST /api/auth/login → Get JWT token
  ↓
2. Store token (localStorage/sessionStorage)
  ↓
3. POST /api/submitReport + Authorization header → Submit report
  ↓
Backend
  1. Verify JWT token
  2. Extract userId from token
  3. Link report to user
  4. Process submission
```

---

## Files Changed

### New Files Created

1. **`backend/controllers/authController.js`**
   - Handles signup and login logic
   - Methods: signup(), login(), verifyToken()

2. **`backend/middleware/auth.js`**
   - JWT token verification middleware
   - Attached user info to req.user

3. **`backend/routes/auth.js`**
   - Route definitions for auth endpoints
   - POST /api/auth/signup
   - POST /api/auth/login
   - GET /api/auth/verify

### Files Modified

1. **`backend/package.json`**
   - Added: jsonwebtoken, bcryptjs

2. **`backend/server.js`**
   - Imported auth routes
   - Mounted at /api/auth
   - Updated endpoint documentation

3. **`backend/middleware/validation.js`**
   - Added validateSignup()
   - Added validateLogin()

4. **`backend/db/init.sql`**
   - Added users table
   - Added userId and phone indexes

5. **`backend/.env`**
   - Added JWT_SECRET configuration

6. **`backend/services/database.js`**
   - Added generic query() method for auth operations

---

## User Flow

### 1. New User: Signup

**Frontend** calls:
```
POST /api/auth/signup
{
  "phone": "+254712345678",
  "password": "SecurePassword123"
}
```

**Backend** responds with:
```
{
  "success": true,
  "data": {
    "userId": "uuid",
    "phone": "+254712345678",
    "token": "eyJ...",
    "expiresIn": "7d"
  }
}
```

**Frontend** stores token in localStorage.

---

### 2. Returning User: Login

**Frontend** calls:
```
POST /api/auth/login
{
  "phone": "+254712345678",
  "password": "SecurePassword123"
}
```

**Backend** responds with JWT token (same format as signup).

**Frontend** stores token in localStorage.

---

### 3. Submit Report (Protected)

**Frontend** calls:
```
POST /api/submitReport
Authorization: Bearer <token>
Content-Type: application/json

{
  "responses": ["User text"],
  "metadata": {
    "location": "Office",
    "mood": "anxious",
    "type": "text",
    "timestamp": "2024-02-03T12:00:00Z"
  }
}
```

**Backend**:
1. Validates Authorization header
2. Verifies JWT signature
3. Extracts userId from token
4. Links report to user in database
5. Continues as normal

---

## Database Changes

### New Table: users

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  passwordHash VARCHAR(255) NOT NULL,  -- bcrypt hash
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  lastLogin TIMESTAMP
);
```

### Index on phone for fast lookups

```sql
CREATE INDEX idx_users_phone ON users(phone);
```

---

## Next Steps for Backend

### 1. Update submitReport to require auth

Currently `/api/submitReport` doesn't require auth. To add authentication:

**In `backend/routes/reports.js`:**

```javascript
const authMiddleware = require('../middleware/auth');

router.post('/submitReport', authMiddleware, validateSubmitReport, async (req, res, next) => {
  // req.user.userId is now available
  // Link report to authenticated user
  try {
    await reportController.submitReport(req, res, next);
  } catch (error) {
    next(error);
  }
});
```

### 2. Update reportController.submitReport

Pass userId when saving:

```javascript
async submitReport(req, res, next) {
  const userId = req.user?.userId; // From JWT

  // ... existing code ...

  // When saving to database:
  const submission = {
    reportId,
    txHash,
    ipfsHash,
    responses,
    metadata,
    userId  // Add this
  };

  await databaseService.saveSubmission(submission);
}
```

### 3. Update submissions table schema

Currently the submissions table doesn't have a userId column. Add it:

```sql
ALTER TABLE submissions ADD COLUMN userId VARCHAR(255);
ALTER TABLE submissions ADD FOREIGN KEY (userId) REFERENCES users(userId);
CREATE INDEX idx_submissions_userId ON submissions(userId);
```

---

## Next Steps for Frontend

### 1. Implement Auth Store

Create a store/service to manage auth state:

```typescript
interface AuthState {
  token: string | null;
  userId: string | null;
  phone: string | null;
  isAuthenticated: boolean;
}

async function signup(phone: string, password: string) {
  const response = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password })
  });

  const data = await response.json();
  if (data.success) {
    // Store in auth state
    localStorage.setItem('authToken', data.data.token);
    return true;
  }
  return false;
}
```

### 2. Update Report Submission

Add Authorization header:

```typescript
async function submitReport(report: any) {
  const token = localStorage.getItem('authToken');

  if (!token) {
    // Redirect to login
    return;
  }

  const response = await fetch('/api/submitReport', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(report)
  });

  return await response.json();
}
```

### 3. Protect Routes

Add login guard to report submission page:

```typescript
if (!isAuthenticated()) {
  navigate('/auth/login');
}
```

---

## Token Management

### Token Storage

Options:
- **localStorage**: Survives page refresh, vulnerable to XSS
- **sessionStorage**: Cleared on page close, vulnerable to XSS
- **Cookie**: HTTPOnly flag prevents XSS, survives page refresh

Recommended: HTTPOnly Secure cookie (backend sets, frontend doesn't manage)

### Token Refresh

Currently, tokens expire in 7 days. When expired:
- Show "Session expired" message
- Redirect to login
- User logs in again

Future: Add `/api/auth/refresh` endpoint for seamless refresh.

### Token Validation

Frontend can optionally verify token isn't expired:

```typescript
function isTokenExpired(token: string) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.exp * 1000 < Date.now();
}
```

---

## Security Checklist

- [x] Passwords hashed with bcryptjs (10 rounds)
- [x] JWT token signed with secret key
- [x] Token expires after 7 days
- [x] Phone must be unique
- [x] Password validation (min 8 chars)
- [ ] HTTPS enforced in production
- [ ] JWT_SECRET changed from default in production
- [ ] Rate limiting on auth endpoints (future)
- [ ] Email/SMS verification (future)
- [ ] Password reset flow (future)

---

## Testing

### Test Signup

```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254712345678",
    "password": "TestPassword123"
  }'
```

Save the returned token.

### Test Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254712345678",
    "password": "TestPassword123"
  }'
```

### Test Protected Endpoint

```bash
curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```

### Test Invalid Token

```bash
curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer invalid_token"
```

Should return 401 error.

---

## Troubleshooting

### "Database not initialized"
- Ensure PostgreSQL is running
- Check DATABASE_URL in .env

### "User already exists"
- Phone number already registered
- Use a different phone or login instead

### "Invalid token"
- Token is malformed or invalid
- Check Authorization header format: `Bearer <token>`

### "Token expired"
- Login again to get a new token
- Check token expiry: 7 days

---

## Summary

✅ Authentication endpoints ready
✅ JWT token generation working
✅ Password hashing with bcryptjs
✅ Validation middleware in place
✅ Users table in database

**Next**: Update report submission to require authentication and link reports to users.
