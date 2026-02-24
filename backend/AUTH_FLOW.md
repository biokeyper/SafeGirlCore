# SafeGirl Authentication Flow

**Base URL:** `http://192.168.1.181:3001/api` (update IP for your environment)

---

## Quick Summary

| Flow | Uses | Requires |
|------|------|----------|
| **Signup** | Phone only | Phone number only |
| **Set Recovery Email** | Email (optional) | After authenticated, call setup-email endpoint |
| **Daily Login** | Phone only | Phone number only |
| **Account Recovery** | Email | Email (if lost phone & recovery email was set) |

---

## 1. SIGNUP FLOW

### Step 1: Initiate Signup (Send OTP to Phone)

**Request:**
```http
POST /auth/signup/initiate
Content-Type: application/json

{
  "phone": "+254712345678"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to your phone. Enter the 6-digit code to continue.",
  "data": {
    "phone": "+254712345678",
    "expiresIn": "5m",
    "_testOTP": "123456"  // Only in development
  }
}
```

**Error Response (409):**
```json
{
  "error": true,
  "message": "Phone number already registered. Please login instead."
}
```

---

### Step 2: Verify OTP and Create Account

**Request:**
```http
POST /auth/signup/verify
Content-Type: application/json

{
  "phone": "+254712345678",
  "otp": "123456"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Account created successfully. You can set a recovery email later.",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+254712345678",
    "email": null,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d",
    "createdAt": "2024-01-01T10:00:00.000Z",
    "hasRecoveryEmail": false
  }
}
```

**Error Response (401):**
```json
{
  "error": true,
  "message": "Invalid OTP",
  "code": "INVALID_OTP",
  "attemptsLeft": 2
}
```

---

### Step 3: (Optional) Set Recovery Email

**After signup, you can optionally set a recovery email to enable account recovery if you lose your phone.**

**Request:**
```http
POST /auth/setup-email
Authorization: Bearer {token}
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Recovery email saved. Verification email sent.",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+254712345678",
    "email": "user@example.com",
    "emailVerified": false
  }
}
```

**Error Response (409):**
```json
{
  "error": true,
  "message": "Email already registered by another user"
}
```

---

## 2. LOGIN FLOW

### Step 1: Initiate Login (Send OTP to Phone)

**Request:**
```http
POST /auth/login/initiate
Content-Type: application/json

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
    "expiresIn": "5m",
    "_testOTP": "123456"  // Only in development
  }
}
```

---

### Step 2: Verify OTP and Get Token

**Request:**
```http
POST /auth/login/verify
Content-Type: application/json

{
  "phone": "+254712345678",
  "otp": "123456"
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

## 3. USING THE JWT TOKEN

After login/signup, you have a **JWT token** valid for **7 days**.

### Store the Token

```javascript
// React Native / Expo
import AsyncStorage from '@react-native-async-storage/async-storage';

// After login
await AsyncStorage.setItem('authToken', response.data.token);
```

### Use Token for Protected Endpoints

Add token to every request header:

```javascript
// Example: Get reports
const token = await AsyncStorage.getItem('authToken');

const response = await fetch('http://192.168.1.181:3001/api/reports', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### Verify Token is Valid

```http
GET /auth/verify
Authorization: Bearer {token}
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

---

## 4. ACCOUNT RECOVERY (Lost Phone)

If user loses their phone, they can recover account using email.

### Step 1: Send Recovery Link to Email

**Request:**
```http
POST /auth/forgot-phone
Content-Type: application/json

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
    "_testToken": "recovery_token_xyz"  // Only in development
  }
}
```

### Step 2: Verify Recovery Token

User clicks recovery link in email → App receives token

**Request:**
```http
POST /auth/verify-recovery
Content-Type: application/json

{
  "token": "recovery_token_xyz"
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
    "token": "recovery_token_xyz"
  }
}
```

### Step 3: Change to New Phone (Send OTP to New Phone)

**Request:**
```http
POST /auth/change-phone/recovery
Content-Type: application/json

{
  "token": "recovery_token_xyz",
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
    "token": "recovery_token_xyz",
    "expiresIn": "5m",
    "_testOTP": "654321"  // Only in development
  }
}
```

### Step 4: Verify New Phone OTP

**Request:**
```http
POST /auth/verify-phone-change/recovery
Content-Type: application/json

{
  "token": "recovery_token_xyz",
  "newPhone": "+254798765432",
  "otp": "654321"
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

## 5. CHANGE PHONE (Authenticated User)

If user is already logged in and wants to change phone:

### Step 1: Initiate Phone Change

**Request:**
```http
POST /auth/change-phone
Authorization: Bearer {token}
Content-Type: application/json

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
    "expiresIn": "5m",
    "_testOTP": "654321"
  }
}
```

### Step 2: Verify New Phone OTP

**Request:**
```http
POST /auth/verify-phone-change
Authorization: Bearer {token}
Content-Type: application/json

{
  "newPhone": "+254798765432",
  "otp": "654321"
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

## 6. SECURITY & RATE LIMITS

### OTP Limits
- **Valid Duration:** 5 minutes
- **Max Attempts:** 3 failed attempts, then expires
- **Re-send:** Must wait for expiry or request new OTP

### Login Rate Limiting
- **Max Attempts:** 5 per 15 minutes per phone number
- **Error Response (429):**
```json
{
  "error": true,
  "message": "Too many attempts. Please try again later.",
  "retryAfter": "900"  // seconds
}
```

### Recovery Token
- **Valid Duration:** 24 hours
- **Single Use:** Once used, cannot reuse same token
- **New Link:** User must request new recovery link

### JWT Token
- **Duration:** 7 days
- **Auto Expiry:** After 7 days, must login again
- **Error Response (401):** `Token expired`

---

## 7. ERROR CODES & MESSAGES

| Error | Status | Meaning |
|-------|--------|---------|
| `INVALID_OTP` | 401 | Wrong OTP code entered |
| `OTP_EXPIRED` | 401 | OTP expired (after 5 min) |
| `MAX_ATTEMPTS_EXCEEDED` | 401 | Too many failed OTP attempts |
| `TOKEN_EXPIRED` | 401 | JWT token expired (need login) |
| `PHONE_EXISTS` | 409 | Phone already registered |
| `EMAIL_EXISTS` | 409 | Email already registered |
| `USER_NOT_FOUND` | 404 | Phone number not in system |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |

---

## 8. FRONTEND INTEGRATION CHECKLIST

- [ ] **Signup Screen**
  - [ ] Input: phone only (NO email)
  - [ ] POST `/auth/signup/initiate` → Show OTP input
  - [ ] Input: OTP
  - [ ] POST `/auth/signup/verify` → Save token to AsyncStorage
  - [ ] Show prompt: "Want to set recovery email?"
    - [ ] If YES → Navigate to email setup screen
    - [ ] If NO → Skip to home/dashboard

- [ ] **Setup Recovery Email (After Signup)**
  - [ ] Input: email
  - [ ] POST `/auth/setup-email` (with Bearer token) → Email saved
  - [ ] Show: "Email verification link sent"

- [ ] **Login Screen**
  - [ ] Input: phone only
  - [ ] POST `/auth/login/initiate` → Show OTP input
  - [ ] Input: OTP
  - [ ] POST `/auth/login/verify` → Save token to AsyncStorage

- [ ] **Protected Requests**
  - [ ] Every API call includes `Authorization: Bearer {token}` header
  - [ ] Handle 401 → Redirect to login (token expired)

- [ ] **Account Recovery** (only if recovery email was set)
  - [ ] "Forgot Phone?" button → Open forgot phone form
  - [ ] Input: email
  - [ ] POST `/auth/forgot-phone` → Show recovery link message
  - [ ] Deep link from email → recovery screen with token
  - [ ] Input: new phone → POST `/auth/change-phone/recovery`
  - [ ] Input: OTP → POST `/auth/verify-phone-change/recovery`

- [ ] **Token Management**
  - [ ] Store token in AsyncStorage (not localStorage)
  - [ ] Add token to all API requests
  - [ ] Handle token expiry (401 responses)
  - [ ] Logout: Clear token from AsyncStorage

---

## 9. EXAMPLE: Complete Signup Flow (Frontend Code)

```javascript
// Expo/React Native example

const handleSignup = async (phone) => {
  // Step 1: Send OTP (phone only, no email)
  const initiateRes = await fetch(
    'http://192.168.1.181:3001/api/auth/signup/initiate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })  // NO email here
    }
  );

  const initiateData = await initiateRes.json();

  if (!initiateRes.ok) {
    alert(initiateData.message);
    return;
  }

  // Show OTP input screen
  navigation.navigate('VerifyOTP', { phone });
};

const handleVerifySignup = async (phone, otp) => {
  // Step 2: Verify OTP and create account (no email)
  const verifyRes = await fetch(
    'http://192.168.1.181:3001/api/auth/signup/verify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })  // NO email here
    }
  );

  const verifyData = await verifyRes.json();

  if (!verifyRes.ok) {
    alert(verifyData.message);
    return;
  }

  // Save token
  await AsyncStorage.setItem('authToken', verifyData.data.token);

  // Step 3: Ask user if they want to set recovery email
  const wantEmail = await promptUserForEmail();  // Show yes/no dialog

  if (wantEmail) {
    navigation.navigate('SetupRecoveryEmail', { token: verifyData.data.token });
  } else {
    navigation.navigate('Home');
  }
};

const handleSetupRecoveryEmail = async (email, token) => {
  // Step 3: Set recovery email (optional, after signup)
  const setupRes = await fetch(
    'http://192.168.1.181:3001/api/auth/setup-email',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ email })
    }
  );

  const setupData = await setupRes.json();

  if (!setupRes.ok) {
    alert(setupData.message);
    return;
  }

  alert('Recovery email saved! Check your email for verification link.');
  navigation.navigate('Home');
};
```

---

## 10. EXAMPLE: Using Token in API Calls

```javascript
const getReports = async () => {
  const token = await AsyncStorage.getItem('authToken');

  const response = await fetch(
    'http://192.168.1.181:3001/api/reports',
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (response.status === 401) {
    // Token expired - go to login
    navigation.navigate('Login');
    return;
  }

  const data = await response.json();
  return data;
};
```

---

## Notes for Frontend Team

1. **Always include IP address** in API calls (not localhost)
2. **Store token in AsyncStorage**, not state
3. **Add token to ALL protected endpoints** (see API_REFERENCE.md for which ones)
4. **Handle 401 responses** → User needs to login again
5. **OTP expires in 5 minutes** → Show countdown timer
6. **Max 3 OTP attempts** → Show "Request new OTP" button
7. **Testing:** Use `_testOTP` in development responses
8. **Phone format:** Ensure consistent format (with country code like +254)
9. **Recovery email is OPTIONAL** → Users can skip it initially and set it later
10. **Recovery email needs verification** → Show message when email is set

---

## KEY CHANGES FROM ORIGINAL DESIGN

### ✅ Phone-Only Signup
- **Before:** Signup required phone + email
- **Now:** Signup requires phone only
- **Why:** Faster onboarding, less friction for new users

### ✅ Optional Recovery Email Setup
- **Before:** Email was mandatory during signup
- **Now:** Email is optional, set AFTER authentication via `/auth/setup-email`
- **Why:** Better UX - users can set email later if they want account recovery

### ✅ New Endpoint: POST /auth/setup-email
- **Protected:** Requires JWT token
- **When:** After user is authenticated (after login or signup)
- **Purpose:** Let users optionally add recovery email to enable account recovery
- **Response:** Shows if email is verified

---

## Questions?

Contact backend team for clarifications on auth flow.
