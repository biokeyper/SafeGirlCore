# Phone-Based Report Sharing with Deep Linking

## Overview

Replaces userId-based sharing with a secure, shareable link system that doesn't require knowing the recipient's user ID. Perfect for an emergency app where users share reports with contacts who may not be SafeGirl users yet.

---

## How It Works

### Flow Diagram

```
User A (Reporter)
    ↓
    Generate share link
    ↓
    Share token + deep link created
    ↓
    Send to User B (SMS, chat, etc.)
    ↓
User B receives link
    ├─→ If already registered: Click link → Auto sign-in → Claim link → Access granted
    └─→ If not registered: Click link → See preview → Sign up → Auto sign-in → Claim link → Access granted
    ↓
User B has access to report
```

### Key Features

✅ **No UserID Required** - Share via link, not username  
✅ **Deep Linking** - Mobile app support: `safegirl://share/token`  
✅ **Public Links** - Share with anyone (or phone-specific)  
✅ **Expiring Links** - Auto-expire after 30 days (configurable)  
✅ **Single-Use Option** - Can limit to 1 claim or allow multiple  
✅ **Auto-Grant on SignIn** - Access granted immediately after signing up via link  

---

## API Endpoints

### 1. Generate Share Link
**POST /api/share/generate** (Protected)

**Purpose:** Create a shareable link for a report

**Request:**
```json
{
  "reportId": "report_abc123",
  "recipientPhone": "+256750902921",  // Optional: target specific phone
  "message": "Please review this incident",  // Optional: include message
  "expiresIn": 2592000                // Optional: seconds (default 30 days)
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shareToken": "abc123def456...",
    "deepLink": "safegirl://share/abc123def456...",
    "shortLink": "https://safegirl.app/share/abc123def456...",
    "expiresAt": "2026-05-05T12:00:00.000Z",
    "recipientPhone": "+256750902921"
  }
}
```

**Use Cases:**
- Reporter shares with friend via SMS: Share `shortLink`
- Reporter shares with support team: Use `deepLink` in email
- Reporter records link for later: Save `shareToken`

---

### 2. Claim Share Link
**POST /api/share/claim/:shareToken** (Protected)

**Purpose:** Claim a share link and grant report access (called after sign-in)

**How it's called:**
1. User clicks share link (before signing in)
2. Mobile app recognizes `safegirl://share/...` and extracts token
3. App shows preview of who shared it (optional)
4. User taps "Sign In" or "Sign Up"
5. After successful auth, app automatically calls `/api/share/claim/:shareToken`

**Response:**
```json
{
  "success": true,
  "message": "Access granted successfully",
  "data": {
    "reportId": "report_abc123",
    "accessId": "access_123",
    "expiresAt": "2027-04-05T12:00:00.000Z"
  }
}
```

**Validation:**
- ✅ Link must not be expired
- ✅ Link must not exceed max claims
- ✅ If phone-specific, user's phone must match
- ✅ User must be authenticated

**Errors:**
- `404` - Link not found or expired
- `410` - Link expired or max claims reached
- `403` - Phone number doesn't match (if restricted)

---

### 3. Get Share Link Info (Preview)
**GET /api/share/info/:shareToken** (Public - no auth required)

**Purpose:** Show preview of shared report before signing in

**Response:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "message": "Please review this incident",
    "expiresAt": "2026-05-05T12:00:00.000Z",
    "requiresPhone": true,
    "recipientPhone": "+256750902921"
  }
}
```

**Shown to user:**
- Who shared it (from message)
- Expiry date
- Whether it's intended for their phone

---

### 4. Get My Share Links
**GET /api/share/my-links?limit=10&offset=0** (Protected)

**Purpose:** View all links I've created and their status

**Response:**
```json
{
  "success": true,
  "data": {
    "shareLinks": [
      {
        "id": 1,
        "reportId": "report_abc123",
        "shareToken": "abc123de...",
        "shareTokenFull": "abc123def456...",
        "recipientPhone": "+256750902921",
        "status": "claimed",
        "claimedBy": "user_xyz789",
        "claimCount": 1,
        "maxClaims": 1,
        "expiresAt": "2026-05-05T12:00:00.000Z",
        "claimedAt": "2026-04-06T10:30:00.000Z",
        "createdAt": "2026-04-05T12:00:00.000Z"
      }
    ],
    "totalCount": 1
  }
}
```

---

### 5. Revoke Share Link
**DELETE /api/share/revoke/:shareToken** (Protected)

**Purpose:** Cancel a share link (immediately revokes access for new users)

**Note:** Existing users with claimed links retain access (access is stored separately)

**Response:**
```json
{
  "success": true,
  "message": "Share link revoked successfully"
}
```

---

## Mobile App Integration

### Deep Link Handling

**Android:**
```kotlin
// AndroidManifest.xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="safegirl" android:host="share" />
</intent-filter>

// In Activity
val shareToken = intent.data?.getQueryParameter("token")
if (shareToken != null) {
    navigateToShareClaim(shareToken)
}
```

**iOS:**
```swift
// In SceneDelegate
if let url = connectionOptions.urlContexts.first?.url,
   url.scheme == "safegirl",
   let shareToken = url.host {
    navigateToShareClaim(shareToken)
}
```

### SignUp/SignIn Flow with Sharing

```
User clicks share link
    ↓
App extracts token from URL
    ↓
Show preview (optional): /api/share/info/:token
    ↓
User not signed in?
    ├─→ Go to signup
    ├─→ User completes signup
    ├─→ JWT token received
    └─→ Auto-call /api/share/claim/:token
    
User already signed in?
    └─→ Direct call /api/share/claim/:token
    ↓
Access granted (in response)
    ↓
Navigate to report
```

### Suggested App Flow

```javascript
// After successful login/signup
const claimResponse = await api.post(
  `/api/share/claim/${shareToken}`,
  {}
);

if (claimResponse.success) {
  // Access granted
  navigateToReport(claimResponse.data.reportId);
} else {
  showError(claimResponse.message);
}
```

---

## Database Schema

### `report_share_links` Table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | SERIAL | Unique identifier |
| `report_id` | VARCHAR(255) | Report being shared |
| `reporter_id` | VARCHAR(255) | User who shared it |
| `share_token` | VARCHAR(255) UNIQUE | Secure token for deep link |
| `recipient_phone` | VARCHAR(20) | Optional: specific phone (E.164) |
| `recipient_user_id` | VARCHAR(255) | Optional: specific user ID |
| `status` | VARCHAR(50) | pending, claimed, expired |
| `claimed_by_user_id` | VARCHAR(255) | User who claimed the link |
| `claimed_at` | TIMESTAMP | When link was claimed |
| `expires_at` | TIMESTAMP | Link expiry date |
| `max_claims` | INTEGER | Max times link can be claimed (1=single-use) |
| `claim_count` | INTEGER | Number of times claimed |
| `access_expires_at` | TIMESTAMP | When access to report expires |
| `access_level` | VARCHAR(50) | view, comment, etc. |
| `message` | TEXT | Optional share message |
| `created_at` | TIMESTAMP | When link was created |
| `updated_at` | TIMESTAMP | Last update |

**Indexes:**
- `share_token` (for lookups)
- `reporter_id` (for listing creator's links)
- `recipient_phone` (for phone-specific shares)
- `status` (for filtering)
- `expires_at` (for cleanup)

---

## Security Considerations

### Token Generation
- 256-bit random tokens (32 bytes)
- Cryptographically secure: `crypto.randomBytes(32).toString('hex')`
- Tokens are NOT guessable (2^256 possibilities)

### Phone Verification
- If `recipient_phone` is specified, only that phone can claim
- Phone numbers normalized to E.164 format
- Matches against `users.phone` during claim

### Expiry
- Default: 30 days
- Can be customized per link
- Automatic cleanup: Expired links marked as `expired` in DB
- Optional: Run daily cleanup job to delete expired `pending` links

### Rate Limiting
- **Claim endpoint:** No rate limit (emergency app)
- **Generate endpoint:** No rate limit (users control sharing)
- **Info endpoint:** No auth needed (public preview)

### Access Control
- User can only revoke links they created
- User can only see links they created
- Claiming link grants access (separate `access_records` entry)

---

## Cleanup & Maintenance

### Expired Link Cleanup
**Run periodically (daily or weekly):**
```sql
DELETE FROM report_share_links
WHERE status = 'pending' AND expires_at < CURRENT_TIMESTAMP;
```

**Or via API endpoint (admin):**
```javascript
await databaseService.deleteExpiredShareLinks();
```

### Monitoring

**Check link statistics:**
```sql
SELECT
  status,
  COUNT(*) as count
FROM report_share_links
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status;
```

**Output:**
```
status        | count
--------------+-------
pending       | 5     (waiting to be claimed)
claimed       | 23    (successfully shared)
expired       | 2     (auto-expired)
```

---

## Comparison: Old vs New System

| Feature | Old (UserID) | New (Link) |
|---------|-------------|-----------|
| **Share via** | Know recipient's userId | Send link (SMS, chat) |
| **Requires signup** | Recipient must be user | Auto-signup via link |
| **Works for non-users** | ❌ No | ✅ Yes |
| **Unauth sharing** | ❌ No | ✅ Yes (see preview) |
| **Deep linking** | ❌ No | ✅ Yes |
| **Auto-grant on signup** | Manual | ✅ Automatic |
| **Revocation** | Immediate | Immediate |
| **Expiry** | None | ✅ Configurable |
| **Phone-specific** | No | ✅ Yes |
| **Single-use links** | No | ✅ Yes |

---

## Testing

### Generate a share link
```bash
curl -X POST http://localhost:3001/api/share/generate \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportId": "report_12345",
    "recipientPhone": "+256750902921",
    "message": "Please review"
  }'
```

### Get share link info (public)
```bash
curl http://localhost:3001/api/share/info/abc123def456...
```

### Claim share link (after signin)
```bash
curl -X POST http://localhost:3001/api/share/claim/abc123def456... \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get my share links
```bash
curl http://localhost:3001/api/share/my-links \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Revoke a link
```bash
curl -X DELETE http://localhost:3001/api/share/revoke/abc123def456... \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

## Migration from Old System

**Optional:** Keep old `grantAccess` endpoints for backward compatibility.

**New recommended flow:**
1. Use `/api/share/generate` instead of `/api/access/grant`
2. Share the link (not userId)
3. Recipient follows deep link → Signs in → Auto-claimed

**Old endpoints remain:**
- `/api/access/grant` - Still works (direct user-to-user)
- `/api/access/shared-with-me` - Still works
- `/api/access/report/:id` - Still works

---

## Future Enhancements

- **QR Codes:** Generate QR code for share link
- **Invite Tracking:** Track who opened vs claimed vs viewed
- **Access Levels:** view-only, can-comment, can-download
- **Share Groups:** Share with multiple people at once
- **Analytics:** Dashboard showing most-shared reports
