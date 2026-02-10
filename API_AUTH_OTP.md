# SafeGirl OTP-Based Authentication API

## Overview

Complete OTP (One-Time Password) based authentication system with phone number recovery and account management.

**Key Features:**
- ✅ No passwords required
- ✅ Phone-based OTP authentication
- ✅ Email-based account recovery
- ✅ Phone number change (with OTP verification)
- ✅ 6-digit OTP sent via SMS
- ✅ 5-minute OTP expiry
- ✅ Max 3 attempts per OTP

---

## API Endpoints

### SIGNUP FLOW (2 steps)

#### Step 1: POST `/api/auth/signup/initiate`
Request OTP for new account

**Request:**
```json
{
  "phone": "+254712345678",
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to your phone. Enter the 6-digit code to continue.",
  "data": {
    "phone": "+254712345678",
    "email": "user@example.com",
    "expiresIn": 300,
    "_testOTP": "123456"  // Only in development
  }
}
```

**Errors:**
```json
{
  "error": true,
  "message": "Phone number already registered. Please login instead.",
  "code": "409"
}
```

#### Step 2: POST `/api/auth/signup/verify`
Verify OTP and create account

**Request:**
```json
{
  "phone": "+254712345678",
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+254712345678",
    "email": "user@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d",
    "createdAt": "2024-02-03T12:00:00.000Z"
  }
}
```

**Errors:**
```json
{
  "error": true,
  "message": "Invalid OTP code",
  "code": "INVALID_OTP",
  "attemptsLeft": 2
}
```

---

### LOGIN FLOW (2 steps)

#### Step 1: POST `/api/auth/login/initiate`
Request OTP for login

**Request:**
```json
{
  "phone": "+254712345678"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to your phone",
  "data": {
    "phone": "+254712345678",
    "expiresIn": 300,
    "_testOTP": "654321"  // Only in development
  }
}
```

#### Step 2: POST `/api/auth/login/verify`
Verify OTP and get JWT token

**Request:**
```json
{
  "phone": "+254712345678",
  "otp": "654321"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+254712345678",
    "email": "user@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d"
  }
}
```

---

### ACCOUNT RECOVERY FLOW (4 steps)
*For users who lost access to their phone*

#### Step 1: POST `/api/auth/forgot-phone`
Start recovery using email

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Recovery link sent to your email",
  "data": {
    "email": "user@example.com",
    "_testToken": "abc123def456..."  // Only in development
  }
}
```

#### Step 2: POST `/api/auth/verify-recovery`
Verify recovery token (from email link)

**Request:**
```json
{
  "token": "abc123def456..."
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Recovery token is valid. Ready to change phone number.",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "token": "abc123def456..."
  }
}
```

#### Step 3: POST `/api/auth/change-phone/recovery`
Submit new phone number, get OTP

**Request:**
```json
{
  "token": "abc123def456...",
  "newPhone": "+254798765432"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to new phone number",
  "data": {
    "newPhone": "+254798765432",
    "token": "abc123def456...",
    "expiresIn": 300,
    "_testOTP": "789012"  // Only in development
  }
}
```

#### Step 4: POST `/api/auth/verify-phone-change/recovery`
Verify OTP on new phone, complete recovery

**Request:**
```json
{
  "token": "abc123def456...",
  "newPhone": "+254798765432",
  "otp": "789012"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Phone number updated successfully",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+254798765432",
    "email": "user@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d"
  }
}
```

---

### AUTHENTICATED USER - PHONE CHANGE (2 steps)

#### Step 1: POST `/api/auth/change-phone`
Authenticated user initiates phone change

**Request:**
```
Authorization: Bearer <jwt_token>

{
  "newPhone": "+254798765432"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to new phone number",
  "data": {
    "newPhone": "+254798765432",
    "expiresIn": 300,
    "_testOTP": "345678"  // Only in development
  }
}
```

#### Step 2: POST `/api/auth/verify-phone-change`
Verify OTP, update phone

**Request:**
```
Authorization: Bearer <jwt_token>

{
  "newPhone": "+254798765432",
  "otp": "345678"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Phone number updated successfully",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+254798765432",
    "email": "user@example.com",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d"
  }
}
```

---

### UTILITY

#### GET `/api/auth/verify`
Verify JWT token is still valid

**Request:**
```
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Token is valid",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+254712345678",
    "email": "user@example.com"
  }
}
```

**Response (401 - Token Invalid):**
```json
{
  "error": true,
  "message": "Invalid token",
  "code": "INVALID_TOKEN"
}
```

**Response (401 - Token Expired):**
```json
{
  "error": true,
  "message": "Token has expired",
  "code": "TOKEN_EXPIRED"
}
```

---

## OTP Details

| Property | Value | Details |
|----------|-------|---------|
| Length | 6 digits | Format: `123456` |
| Expiry | 5 minutes | 300 seconds |
| Max Attempts | 3 | Locked after 3 failures |
| Delivery | SMS | Via SMS provider (Twilio, Africa's Talking, etc.) |
| Regeneration | Allowed | Request new OTP before expiry |

---

## Phone Number Format

Accepted formats:
- `+254712345678` (E.164 international)
- `0712345678` (Leading zero)
- `254712345678` (Country code prefix)

Requirements:
- Min 10 digits
- Max 15 digits (E.164 standard)
- Must contain only digits and optional `+` prefix

---

## Email Format

Requirements:
- Valid email format: `user@example.com`
- Max 255 characters
- Used for account recovery

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Invalid input (phone, email, OTP format) |
| `USER_EXISTS` | 409 | Phone/email already registered |
| `INVALID_OTP` | 401 | OTP code doesn't match |
| `MAX_ATTEMPTS` | 401 | Too many failed OTP attempts |
| `NO_VALID_OTP` | 401 | No active OTP found |
| `INVALID_TOKEN` | 401 | Recovery token is invalid/expired |
| `PHONE_IN_USE` | 409 | New phone number already registered |
| `TOKEN_EXPIRED` | 401 | JWT token has expired |

---

## Development Testing

In development mode (`NODE_ENV=development`), responses include `_testOTP` and `_testToken`:

```json
{
  "success": true,
  "data": {
    "_testOTP": "123456",     // Use this for testing
    "_testToken": "abc123..."  // Use this for testing
  }
}
```

**⚠️ Important:** Remove this in production!

---

## Frontend Implementation

### Signup Example

```typescript
// Step 1: Initiate signup
const initiateSignup = async (phone: string, email: string) => {
  const res = await fetch('http://localhost:3001/api/auth/signup/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, email })
  });
  return await res.json();
};

// Step 2: Verify signup
const verifySignup = async (phone: string, email: string, otp: string) => {
  const res = await fetch('http://localhost:3001/api/auth/signup/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, email, otp })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('authToken', data.data.token);
  }
  return data;
};
```

### Login Example

```typescript
// Step 1: Request OTP
const initiateLogin = async (phone: string) => {
  const res = await fetch('http://localhost:3001/api/auth/login/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone })
  });
  return await res.json();
};

// Step 2: Verify login
const verifyLogin = async (phone: string, otp: string) => {
  const res = await fetch('http://localhost:3001/api/auth/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('authToken', data.data.token);
  }
  return data;
};
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

## Testing with cURL

### Signup

```bash
# Step 1: Initiate
curl -X POST http://localhost:3001/api/auth/signup/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254712345678",
    "email": "user@example.com"
  }'

# Step 2: Verify (use the OTP from development response)
curl -X POST http://localhost:3001/api/auth/signup/verify \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254712345678",
    "email": "user@example.com",
    "otp": "123456"
  }'
```

### Login

```bash
# Step 1: Initiate
curl -X POST http://localhost:3001/api/auth/login/initiate \
  -H "Content-Type: application/json" \
  -d '{"phone": "+254712345678"}'

# Step 2: Verify
curl -X POST http://localhost:3001/api/auth/login/verify \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254712345678",
    "otp": "654321"
  }'
```

### Verify Token

```bash
curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Database Tables

### users
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone_verified BOOLEAN DEFAULT FALSE,
  email_verified BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  lastLogin TIMESTAMP,
  lastPhoneChange TIMESTAMP
);
```

### otps
```sql
CREATE TABLE otps (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255),
  phone VARCHAR(20) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  otp_type VARCHAR(50),  -- 'signup', 'login', 'phone_change', 'recovery'
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP
);
```

### recovery_tokens
```sql
CREATE TABLE recovery_tokens (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  token_type VARCHAR(50),  -- 'phone_recovery', 'email_recovery'
  new_phone VARCHAR(20),
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP
);
```

---

## Security

✅ **OTP Security:**
- 6-digit code (1 million combinations)
- 5-minute expiry
- Max 3 attempts before lockout
- Stored hashed in database

✅ **JWT Security:**
- Signed with JWT_SECRET
- 7-day expiry
- Includes userId, phone, email claims

✅ **Account Recovery:**
- Email verification required
- 24-hour recovery token expiry
- Phone verification on new number

✅ **Input Validation:**
- Phone format validation (E.164)
- Email format validation
- OTP format (6 digits)

---

## Configuration

### Environment Variables

```env
JWT_SECRET=your_secret_key_here_change_in_production
NODE_ENV=development  # Set to 'production' to hide _testOTP
```

### OTP Service Configuration

In `backend/services/otp.js`:

```javascript
this.OTP_LENGTH = 6;           // OTP length in digits
this.OTP_EXPIRY_MINUTES = 5;   // Expiry time in minutes
this.MAX_ATTEMPTS = 3;         // Max verification attempts
```

---

## Integration Checklist

- [ ] Database schema created (init.sql)
- [ ] OTP service configured (otp.js)
- [ ] Auth controller implemented (authController.js)
- [ ] Auth routes defined (routes/auth.js)
- [ ] Validation middleware updated (validation.js)
- [ ] JWT middleware working (middleware/auth.js)
- [ ] SMS provider configured (TODO: integrate Twilio/Africa's Talking)
- [ ] Email provider configured (TODO: integrate SendGrid/mailgun)
- [ ] Frontend signup flow implemented
- [ ] Frontend login flow implemented
- [ ] Frontend recovery flow implemented
- [ ] Protected endpoints require auth

---

## Next Steps

1. **Configure SMS Provider** - Integrate Twilio or Africa's Talking for SMS OTP
2. **Configure Email Provider** - Integrate SendGrid or mailgun for recovery emails
3. **Frontend Integration** - Implement signup/login/recovery UI flows
4. **Add Rate Limiting** - Prevent OTP abuse (max requests per phone)
5. **Add Analytics** - Track signup/login rates
6. **Add Two-Factor Auth** - Optional OTP or authenticator app

---

## Troubleshooting

### "No valid OTP found"
- Request a new OTP
- Check OTP hasn't expired (5 minutes)

### "Max attempts reached"
- Request a new OTP
- User is locked for this attempt batch

### "Phone already registered"
- Use different phone or login
- Cannot have duplicate phone numbers

### "Invalid email format"
- Use valid email: user@example.com
- Check for spaces or special characters

### SMS not received
- Check phone number is correct
- SMS provider might be down
- Check SMS provider configuration

