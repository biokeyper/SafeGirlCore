# JWT Secret Rotation Strategy

## Current Status
- **Secret:** `RLStZy7QZ+scwSQv/Scbc5wvCGagST5ouu2KFP0P3gY=`
- **Strength:** 256-bit (exceeds 128-bit minimum) ✅
- **Rotation Schedule:** Weekly (production), Monthly (staging)

---

## Why Rotate JWT Secrets?

If a secret is ever exposed, rotating it limits the window of vulnerability:
- Old tokens become invalid immediately
- Attacker cannot forge new tokens
- Sessions continue only for devices with valid tokens

---

## Rotation Procedure (Weekly for Production)

### 1. Generate New Secret
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 2. Update GitHub Secrets
- Go to: GitHub → Settings → Secrets and variables → Actions
- Update `JWT_SECRET` with new value
- Old secret saved in password manager for emergency rollback

### 3. Deploy New Backend
- Push change to trigger deployment
- New backend instances will use new secret
- Existing tokens remain valid (can verify with old secret)

### 4. Revoke Old Tokens (Optional)
If secret was compromised:
- Add old secret to a "revoked secrets" list (database or cache)
- Check against revoked list during token verification
- Automatically expire all sessions after cutoff time

### 5. Log Rotation
```
[JWT_ROTATION] Secret rotated
[JWT_ROTATION] Old secret: xxx...
[JWT_ROTATION] New secret: yyy...
[JWT_ROTATION] Timestamp: 2026-04-05T12:00:00Z
[JWT_ROTATION] Deployed to: staging/production
```

---

## Token Lifetime

- **Expiry:** 7 days (set in authController.ts)
- **Oldest possible token:** 7 days old
- **Rotation schedule:** Weekly
- **Overlap:** Old tokens can work for 7 days after rotation

**Example:**
```
Day 1:  Secret A deployed
Day 7:  All tokens from Day 1 expire
Day 8:  Secret B deployed
Day 15: Secret A is invalidated (no tokens older than 7 days)
```

---

## Production Checklist

- [ ] Generate new secret (32 bytes, base64)
- [ ] Update GitHub Secrets
- [ ] Deploy to staging (test sign-in/token verify)
- [ ] Deploy to production (during low-traffic window)
- [ ] Verify users can still sign in
- [ ] Verify tokens still validate
- [ ] Log rotation event
- [ ] Set next rotation date (7 days later)

---

## Emergency Rollback

If rotation breaks authentication:
1. Revert to old secret in GitHub Secrets
2. Redeploy previous backend version
3. Investigate what went wrong
4. Fix in code, test locally, retry rotation

---

## Implementation Notes

- Secret is stored in `.env` (local dev) and GitHub Secrets (CI/CD)
- Never commit secrets to git
- Use `process.env.JWT_SECRET` to access
- Verify secret is set before server starts (currently done in authController.ts)
- Token expiry is independent of secret rotation (can be adjusted separately)
