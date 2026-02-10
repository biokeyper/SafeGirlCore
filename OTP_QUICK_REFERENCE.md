# OTP Authentication - Quick Reference

## All Endpoints at a Glance

### SIGNUP (2 steps)
```
1. POST /api/auth/signup/initiate
   Input:  {phone, email}
   Output: expiresIn, _testOTP

2. POST /api/auth/signup/verify
   Input:  {phone, email, otp}
   Output: userId, token (JWT)
```

### LOGIN (2 steps)
```
1. POST /api/auth/login/initiate
   Input:  {phone}
   Output: expiresIn, _testOTP

2. POST /api/auth/login/verify
   Input:  {phone, otp}
   Output: userId, token (JWT)
```

### RECOVER (4 steps - Phone Stolen)
```
1. POST /api/auth/forgot-phone
   Input:  {email}
   Output: _testToken (in dev)

2. POST /api/auth/verify-recovery
   Input:  {token}
   Output: userId, email, token

3. POST /api/auth/change-phone/recovery
   Input:  {token, newPhone}
   Output: expiresIn, _testOTP

4. POST /api/auth/verify-phone-change/recovery
   Input:  {token, newPhone, otp}
   Output: userId, phone, token (NEW JWT)
```

### CHANGE PHONE (Authenticated, 2 steps)
```
1. POST /api/auth/change-phone
   Auth:   Bearer <jwt>
   Input:  {newPhone}
   Output: expiresIn, _testOTP

2. POST /api/auth/verify-phone-change
   Auth:   Bearer <jwt>
   Input:  {newPhone, otp}
   Output: userId, phone, token (NEW JWT)
```

### VERIFY TOKEN
```
GET /api/auth/verify
Auth:  Bearer <jwt>
Output: userId, phone, email
```

---

## Key Info

| Item | Value |
|------|-------|
| OTP Length | 6 digits |
| OTP Expiry | 5 minutes (300 sec) |
| Max Attempts | 3 |
| JWT Expiry | 7 days |
| Recovery Token Expiry | 24 hours |
| Phone Format | 10-15 digits (with or without + prefix) |
| Email Format | standard@email.com |

---

## Testing in Development

1. **Signup:**
   ```bash
   # Step 1
   curl -X POST http://localhost:3001/api/auth/signup/initiate \
     -H "Content-Type: application/json" \
     -d '{"phone":"+254712345678","email":"user@example.com"}'

   # Response shows _testOTP (use this)
   # Step 2
   curl -X POST http://localhost:3001/api/auth/signup/verify \
     -H "Content-Type: application/json" \
     -d '{"phone":"+254712345678","email":"user@example.com","otp":"123456"}'

   # Response has JWT token
   ```

2. **Login:**
   ```bash
   # Step 1
   curl -X POST http://localhost:3001/api/auth/login/initiate \
     -H "Content-Type: application/json" \
     -d '{"phone":"+254712345678"}'

   # Step 2 (use _testOTP from response)
   curl -X POST http://localhost:3001/api/auth/login/verify \
     -H "Content-Type: application/json" \
     -d '{"phone":"+254712345678","otp":"654321"}'
   ```

3. **Verify Token:**
   ```bash
   curl -X GET http://localhost:3001/api/auth/verify \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

---

## Files Created

- `backend/services/otp.js` - OTP logic
- `backend/controllers/authController.js` - Auth endpoints (rewritten)
- `API_AUTH_OTP.md` - Complete API docs
- `OTP_IMPLEMENTATION_SUMMARY.md` - Full details

## Files Modified

- `backend/db/init.sql` - Added 3 tables (users, otps, recovery_tokens)
- `backend/routes/auth.js` - 10 OTP endpoints
- `backend/middleware/validation.js` - OTP validators
- `backend/server.js` - Updated endpoint logs

---

## Database Schema

### users (NO PASSWORDS!)
```
userId (UUID)
phone (unique)
email (unique)
phone_verified (bool)
email_verified (bool)
createdAt
lastLogin
lastPhoneChange
```

### otps
```
userId (nullable for signup)
phone
otp_code (6 digits)
otp_type (signup/login/phone_change/recovery)
attempts
max_attempts (3)
is_used (bool)
expires_at (5 min)
```

### recovery_tokens
```
userId
email
token (random)
token_type (phone_recovery)
new_phone (optional)
is_used (bool)
expires_at (24 hours)
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Validation error (invalid phone/email/otp format) |
| 401 | Authentication failed (invalid OTP, expired token, etc.) |
| 409 | Conflict (phone/email already exists) |

---

## Frontend Integration

### Store token after login/signup:
```javascript
localStorage.setItem('authToken', response.data.token);
```

### Add token to requests:
```javascript
Authorization: Bearer <token>
```

### Check if authenticated:
```javascript
const token = localStorage.getItem('authToken');
if (!token) {
  // Redirect to login
}
```

---

## Common Errors

**"Phone number already registered"**
→ User exists, use login instead

**"Invalid OTP code"**
→ Wrong code, try again (max 3 attempts)

**"Max attempts reached"**
→ Request new OTP

**"Phone number already registered"** (on phone change)
→ New phone is already in use by someone else

**"Invalid email format"**
→ Check email format (user@example.com)

**"Phone number must contain 10-15 digits"**
→ Check phone format (remove spaces, special chars)

---

## What's NOT Implemented Yet

⚠️ **SMS Provider** - Currently mocked (just logged)
   - Need: Twilio, Africa's Talking, Safaricom
   - TODO: Update `backend/services/otp.js` line ~30

⚠️ **Email Service** - Currently mocked (just logged)
   - Need: SendGrid, Mailgun, AWS SES
   - TODO: Update `backend/controllers/authController.js` forgotPhone()

⚠️ **Rate Limiting** - Not yet implemented
   - TODO: Add rate limiting on OTP requests
   - TODO: Add IP blocking after failures

---

## Production Checklist

- [ ] Change JWT_SECRET to secure random value
- [ ] Set NODE_ENV=production (hides _testOTP)
- [ ] Integrate SMS provider
- [ ] Integrate email provider
- [ ] Set up rate limiting
- [ ] Enable HTTPS
- [ ] Test all flows
- [ ] Monitor logs
- [ ] Set up alerts

---

## Architecture Diagram

```
Frontend                Backend
  |                       |
  |-- Signup Initiate --> | Create OTP
  |<-- _testOTP --------- | (sent via SMS in prod)
  |
  |-- Signup Verify ----> | Verify OTP
  |<-- JWT Token -------- | Create User
  |
  [Store token in localStorage]
  |
  |-- All Requests -----> | Verify JWT
  |  (with Bearer token)  |
```

---

## Quick Test Flow

```bash
# 1. Signup
curl -X POST http://localhost:3001/api/auth/signup/initiate \
  -d '{"phone":"+254712345678","email":"test@test.com"}' \
  -H "Content-Type: application/json"

# Copy _testOTP from response

# 2. Verify signup
curl -X POST http://localhost:3001/api/auth/signup/verify \
  -d '{"phone":"+254712345678","email":"test@test.com","otp":"123456"}' \
  -H "Content-Type: application/json"

# Copy token from response

# 3. Verify it works
curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Expected: {success: true, data: {userId, phone, email}}
```

---

## Where to Find Info

- **Complete API Reference** → `API_AUTH_OTP.md`
- **Implementation Details** → `OTP_IMPLEMENTATION_SUMMARY.md`
- **This Quick Ref** → `OTP_QUICK_REFERENCE.md`
- **Code** → `backend/services/otp.js`, `backend/controllers/authController.js`
- **DB Schema** → `backend/db/init.sql`

---

## Ready to Use! 🚀

All OTP endpoints are live and ready for:
1. Testing with cURL
2. Frontend integration
3. SMS provider integration
4. Email provider integration

