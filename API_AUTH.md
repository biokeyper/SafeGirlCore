# SafeGirl Authentication API Documentation

## Overview

Authentication endpoints handle user signup and login, returning JWT tokens for accessing protected resources.

---

## 1. User Signup

**POST** `/api/auth/signup`

### Request

```json
{
  "phone": "+254712345678",
  "password": "SecurePassword123"
}
```

### Fields

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `phone` | String | Yes | User's phone number | Min 10 characters, numeric format |
| `password` | String | Yes | User's password | Min 8 chars, max 128 chars |

### Response (201 - Success)

```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+254712345678",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d",
    "createdAt": "2024-02-03T12:30:45.000Z"
  }
}
```

### Response (400 - Validation Error)

```json
{
  "error": true,
  "message": "Password must be at least 8 characters"
}
```

### Response (409 - User Already Exists)

```json
{
  "error": true,
  "message": "User with this phone number already exists"
}
```

### What Backend Does

```
1. Validate phone and password
2. Check if user already exists
3. Hash password with bcryptjs (10 rounds)
4. Generate unique userId (UUID)
5. Store in users table
6. Generate JWT token (7-day expiry)
7. Return token to frontend
```

---

## 2. User Login

**POST** `/api/auth/login`

### Request

```json
{
  "phone": "+254712345678",
  "password": "SecurePassword123"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phone` | String | Yes | User's phone number |
| `password` | String | Yes | User's password |

### Response (200 - Success)

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+254712345678",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d"
  }
}
```

### Response (401 - Invalid Credentials)

```json
{
  "error": true,
  "message": "Invalid phone or password"
}
```

### What Backend Does

```
1. Validate inputs
2. Find user by phone
3. Compare password with bcrypt hash
4. Update lastLogin timestamp
5. Generate JWT token (7-day expiry)
6. Return token to frontend
```

---

## 3. Verify Token

**GET** `/api/auth/verify`

Protected endpoint - requires valid JWT token.

### Request

```
GET /api/auth/verify
Authorization: Bearer <your_jwt_token>
```

### Response (200 - Token Valid)

```json
{
  "success": true,
  "message": "Token is valid",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+254712345678"
  }
}
```

### Response (401 - Invalid Token)

```json
{
  "error": true,
  "message": "Invalid token",
  "code": "INVALID_TOKEN"
}
```

### Response (401 - Token Expired)

```json
{
  "error": true,
  "message": "Token has expired",
  "code": "TOKEN_EXPIRED"
}
```

---

## JWT Token Usage

After login/signup, use the token in all protected requests:

```
Authorization: Bearer <token>
```

### Example Request with Token

```bash
curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Invalid input (password too short, etc.) |
| `USER_EXISTS` | 409 | Phone number already registered |
| `INVALID_CREDENTIALS` | 401 | Phone or password is wrong |
| `INVALID_TOKEN` | 401 | JWT token is malformed or invalid |
| `TOKEN_EXPIRED` | 401 | JWT token has expired |

---

## Frontend Implementation

### Signup Example

```typescript
async function signup(phone: string, password: string) {
  const response = await fetch('http://localhost:3001/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password })
  });

  const data = await response.json();

  if (data.success) {
    // Store token in secure storage
    localStorage.setItem('authToken', data.data.token);
    return {
      success: true,
      userId: data.data.userId,
      token: data.data.token
    };
  } else {
    throw new Error(data.message);
  }
}
```

### Login Example

```typescript
async function login(phone: string, password: string) {
  const response = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password })
  });

  const data = await response.json();

  if (data.success) {
    // Store token
    localStorage.setItem('authToken', data.data.token);
    return {
      success: true,
      userId: data.data.userId,
      token: data.data.token
    };
  } else {
    throw new Error(data.message);
  }
}
```

### Using Protected Endpoints

```typescript
async function submitReport(report: any) {
  const token = localStorage.getItem('authToken');

  const response = await fetch('http://localhost:3001/api/submitReport', {
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

---

## Token Expiry

- **Default Expiry**: 7 days
- **When expired**: Use login endpoint to get a new token
- **No refresh tokens**: Currently, users must login again when token expires

### Future Enhancement

Could add `/api/auth/refresh` endpoint to refresh tokens without re-entering credentials.

---

## Security Notes

1. **Token Storage**: Store in localStorage or sessionStorage (frontend decision)
2. **Transport**: Always use HTTPS
3. **Password Requirements**: Min 8 characters
4. **Phone Validation**: Must be at least 10 digits
5. **No Passwords Returned**: Backend never returns password hashes
6. **JWT Secret**: Change `JWT_SECRET` in production `.env`

---

## Example cURL Commands

### Signup

```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254712345678",
    "password": "SecurePassword123"
  }'
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254712345678",
    "password": "SecurePassword123"
  }'
```

### Verify Token

```bash
curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

---

## Integration with Report Submission

After authentication, reports can be submitted using the JWT token:

```json
POST /api/submitReport
Authorization: Bearer <token>

{
  "responses": ["User's text response"],
  "metadata": {
    "location": "Office",
    "mood": "anxious",
    "type": "text",
    "timestamp": "2024-02-03T12:30:00Z"
  }
}
```

The backend will:
1. Verify the JWT token
2. Extract userId from token
3. Link the report to the authenticated user
4. Process as normal

---

## Database Schema

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  passwordHash VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  lastLogin TIMESTAMP
);
```

---

## Next Steps

1. Install dependencies: `npm install jsonwebtoken bcryptjs`
2. Update database with users table
3. Restart backend server
4. Test with curl commands above
5. Integrate frontend with signup/login flows
