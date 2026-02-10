# Quick Start: Authentication System

## ✅ What's Ready

Authentication endpoints are fully implemented and ready to use.

---

## Quick API Reference

### 1. Signup (Create Account)

```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254712345678",
    "password": "MySecurePassword123"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d"
  }
}
```

**Save the token!** You'll need it for next steps.

---

### 2. Login (Get Token)

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254712345678",
    "password": "MySecurePassword123"
  }'
```

**Response:** Same format as signup (with token)

---

### 3. Use Token to Access Protected Endpoints

```bash
curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Frontend Integration (Quick Copy-Paste)

### Auth Service

```typescript
// authService.ts
const API_URL = 'http://localhost:3001';

export async function signup(phone: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('authToken', data.data.token);
    localStorage.setItem('userId', data.data.userId);
  }
  return data;
}

export async function login(phone: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('authToken', data.data.token);
    localStorage.setItem('userId', data.data.userId);
  }
  return data;
}

export function getToken(): string | null {
  return localStorage.getItem('authToken');
}

export function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userId');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
```

### Using API with Auth

```typescript
// api.ts
export async function submitReport(report: any) {
  const token = localStorage.getItem('authToken');
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}/api/submitReport`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(report)
  });
  return await res.json();
}
```

---

## Key Details

| Item | Value |
|------|-------|
| Signup Endpoint | POST /api/auth/signup |
| Login Endpoint | POST /api/auth/login |
| Token Verify | GET /api/auth/verify |
| Token Expiry | 7 days |
| Password Min Length | 8 characters |
| Phone Min Length | 10 digits |
| Token Header | `Authorization: Bearer <token>` |

---

## Error Responses

### Invalid Password
```json
{
  "error": true,
  "message": "Invalid phone or password"
}
```

### User Already Exists
```json
{
  "error": true,
  "message": "User with this phone number already exists"
}
```

### Invalid Token
```json
{
  "error": true,
  "message": "Invalid token",
  "code": "INVALID_TOKEN"
}
```

### Token Expired
```json
{
  "error": true,
  "message": "Token has expired",
  "code": "TOKEN_EXPIRED"
}
```

---

## Database

Users are stored in PostgreSQL:

```sql
SELECT * FROM users;
```

Table structure:
```
id          - Auto-increment ID
userId      - Unique user identifier (UUID)
phone       - Phone number (unique)
passwordHash - Bcrypt hashed password
createdAt   - Account creation timestamp
lastLogin   - Last login timestamp
```

---

## Testing Workflow

1. **Start backend:**
   ```bash
   cd backend && npm start
   ```

2. **Signup new user:**
   ```bash
   curl -X POST http://localhost:3001/api/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"phone":"+254712345678","password":"TestPass123"}'
   ```

3. **Save the token from response**

4. **Test token verification:**
   ```bash
   curl -X GET http://localhost:3001/api/auth/verify \
     -H "Authorization: Bearer <YOUR_TOKEN>"
   ```

5. **Test login with same credentials:**
   ```bash
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"phone":"+254712345678","password":"TestPass123"}'
   ```

---

## Security Checklist

✅ Passwords hashed with bcryptjs (10 rounds)
✅ JWT tokens signed with secret key
✅ Tokens expire after 7 days
✅ Phone numbers must be unique
✅ Password validation enforced
✅ Protected endpoints via middleware

⚠️ **PRODUCTION**: Change JWT_SECRET in `.env`

---

## Common Issues

### "Database not initialized"
→ Check PostgreSQL is running, DATABASE_URL is set

### "User already exists"
→ Use different phone number or login instead

### "Invalid token"
→ Check Authorization header format: `Bearer <token>`

### "Cannot find module 'jsonwebtoken'"
→ Run: `npm install`

---

## Next: Add Access Control

The smart contract has functions to grant/revoke access. Create these endpoints:

```javascript
POST /api/report/:id/grantAccess   // Grant access to viewer
POST /api/report/:id/revokeAccess  // Revoke access
GET  /api/report/:id/consents      // Get list of people with access
```

See: `AUTH_INTEGRATION.md` for full guide

---

## Documentation

- **API_AUTH.md** - Full API reference
- **AUTH_INTEGRATION.md** - Integration guide
- **AUTH_IMPLEMENTATION_SUMMARY.md** - Implementation details

