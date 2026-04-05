# Deployment Guide: Development → Staging → Production

## Overview

This guide covers deploying SafeGirl from local development to staging on Render, then to production.

**Architecture:**
```
Local Dev (.env file)
    ↓
GitHub (code repo)
    ↓ with GitHub Secrets
Render (staging/production server)
```

---

## Prerequisites

1. **GitHub account** with SafeGirlCore repository
2. **Render account** (free tier available)
3. **PostgreSQL database** (local for dev, managed on Render for staging/production)
4. **Twilio account** (for SMS, staging + production numbers)
5. **Gmail account** (for email recovery, staging + production)
6. **Pinata/Web3.storage account** (for IPFS)

---

## Phase 1: Local Development Setup

### 1.1 Environment File (.env)

```bash
# backend/.env (not committed to git)
NODE_ENV=development
DATABASE_URL=postgresql://safegirl_user:safegirl_password@localhost:5432/safegirl_db
PRIVATE_KEY=c9245e12074cd98db99dff7a0a537bb3bf278ba136be257698cb451021d327ef
JWT_SECRET=RLStZy7QZ+scwSQv/Scbc5wvCGagST5ouu2KFP0P3gY=
... (other secrets from .env.example)
```

### 1.2 Run Locally

```bash
cd backend
npm install
npm run build
npm start
```

Backend runs at `http://localhost:3001`

### 1.3 Test Endpoints

```bash
# Test signup
curl -X POST http://localhost:3001/api/auth/signup/initiate \
  -H "Content-Type: application/json" \
  -d '{"phone": "+256750902921", "country": "UG"}'
```

---

## Phase 2: Staging Deployment (Render)

### 2.1 Create GitHub Secrets

Follow [GITHUB_SECRETS_SETUP.md](GITHUB_SECRETS_SETUP.md):

1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Add all required secrets:
   - DATABASE_URL (staging database)
   - PRIVATE_KEY (staging wallet)
   - JWT_SECRET
   - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (staging number)
   - EMAIL_FROM, EMAIL_PASSWORD (staging email)
   - PINATA_JWT
   - DEPLOYED_CONTRACT_ADDRESS
   - POLYGON_AMOY_RPC_URL
   - FRONTEND_URL (staging app URL)

### 2.2 Create Staging Database

**Option A: Render PostgreSQL (easiest)**

1. Go to [render.com](https://render.com)
2. Create new PostgreSQL database
3. Name: `safegirl-staging-db`
4. Region: Closest to you (e.g., eu-west-1)
5. Copy connection string:
   ```
   postgresql://user:password@host:5432/safegirl_db
   ```
6. Add to GitHub Secrets as `DATABASE_URL` (staging value)

**Option B: Docker Compose (if running locally)**

```bash
docker-compose up -d postgres
# Database available at localhost:5432
```

### 2.3 Create Staging Backend on Render

1. Go to Render Dashboard
2. Click **New** → **Web Service**
3. **Connect GitHub repo:**
   - Search for SafeGirlCore
   - Click Connect
4. **Configuration:**
   - **Name:** safegirl-staging-backend
   - **Environment:** Node
   - **Build Command:** `cd backend && npm install && npm run build`
   - **Start Command:** `cd backend && npm start`
   - **Plan:** Free (if available)
5. **Environment Variables:**
   - Click **Add from GitHub Secrets**
   - Select all secrets one by one:
     - DATABASE_URL
     - PRIVATE_KEY
     - JWT_SECRET
     - ... (all secrets)
6. **Deploy:**
   - Click **Create Web Service**
   - Render builds and deploys automatically
   - URL: `https://safegirl-staging-backend.onrender.com`

### 2.4 Run Database Migrations

```bash
# On Render, run migrations
curl -X POST https://safegirl-staging-backend.onrender.com/api/health

# Or SSH into Render and run:
psql $DATABASE_URL < backend/db/init.sql
```

### 2.5 Test Staging Deployment

```bash
# Test from local machine
curl -X POST https://safegirl-staging-backend.onrender.com/api/auth/signup/initiate \
  -H "Content-Type: application/json" \
  -d '{"phone": "+256750902921", "country": "UG"}'

# Update mobile app API endpoint to:
# https://safegirl-staging-backend.onrender.com
```

### 2.6 Share with Boss for Testing

1. Send link: `https://safegirl-staging-backend.onrender.com`
2. Deploy mobile app to Google Play internal testing track
3. Configure app to use staging backend
4. Boss tests and approves

---

## Phase 3: Production Deployment (Render)

### 3.1 Update GitHub Secrets (Production Values)

Update these secrets to production values:

- `DATABASE_URL` → Production database (separate secret or environment)
- `PRIVATE_KEY` → Production wallet (different from staging)
- `TWILIO_PHONE_NUMBER` → Production Twilio number
- `EMAIL_FROM` → Production email address
- `EMAIL_PASSWORD` → Production email password
- `POLYGON_AMOY_RPC_URL` → Change to mainnet RPC:
  ```
  https://polygon-rpc.com  (or another mainnet RPC)
  ```
- `FRONTEND_URL` → Production app URL

### 3.2 Create Production Environment (Optional)

For safer multi-environment deployments:

1. GitHub repo → Settings → Environments → New environment
2. Name: `production`
3. Add production-specific secrets
4. Require approval before deploying to production

### 3.3 Create Production Backend on Render

Repeat 2.3, but:
- Name: `safegirl-production-backend`
- Plan: Paid (for reliability)
- Region: Multi-region or closest to users
- Auto-deploy: Only on `main` branch (not staging)

### 3.4 Set Up Auto-Deployment

Update `.github/workflows/deploy.yml` (if using GitHub Actions):

```yaml
name: Deploy

on:
  push:
    branches: [staging, main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Render
        env:
          RENDER_DEPLOY_KEY: ${{ secrets.RENDER_DEPLOY_KEY }}
        run: |
          # Deploy to staging on staging branch
          # Deploy to production on main branch
```

### 3.5 Launch Production

1. Final testing on staging
2. Boss approval
3. Create GitHub release: `v1.0.0`
4. Merge `staging` → `main`
5. Production backend auto-deploys
6. Submit mobile app to Google Play Store

---

## Rollback Procedure

If production breaks:

### Option 1: Revert Code

```bash
# On main branch
git revert <commit-hash>
git push origin main
# Render auto-redeploys with previous code
```

### Option 2: Render Rollback

1. Go to Render dashboard
2. Select production service
3. Click **Deployments**
4. Click previous successful deployment
5. Click **Redeploy**

### Option 3: Manual Secrets Rollback

If secrets were rotated and caused issues:

1. GitHub repo → Settings → Secrets
2. Update secret back to previous value
3. Trigger manual redeploy on Render

---

## Monitoring & Logs

### View Logs on Render

1. Go to service page
2. Click **Logs** tab
3. Filter by date/time
4. Search for errors

### Set Up Alerts

1. Render → Settings → Notifications
2. Enable email/webhook alerts for:
   - Deploy failed
   - Service crashed
   - Database connection lost

---

## Scaling & Performance

As users grow:

1. **Database:**
   - Upgrade Render PostgreSQL to paid plan
   - Enable backups
   - Monitor query performance

2. **Backend:**
   - Render auto-scales paid plans
   - Monitor CPU/memory usage
   - Add Redis for caching (if needed)

3. **Storage:**
   - IPFS (Pinata) handles unlimited files
   - Monitor costs at pinata.cloud

---

## Security Checklist

- [ ] All secrets in GitHub Secrets (not .env)
- [ ] HTTPS enabled (Render auto-provides)
- [ ] CORS configured (FRONTEND_URL set correctly)
- [ ] Database password strong (auto-generated by Render)
- [ ] Backups enabled (Render auto-backs up PostgreSQL)
- [ ] JWT_SECRET rotated weekly
- [ ] Private key secure (hardware wallet recommended for production)
- [ ] Email password as app-specific password (not main account password)
- [ ] Rate limiting enabled (already implemented)
- [ ] Input validation enabled (already implemented)

---

## Cost Estimation

### Staging (MVP)
- Render free tier: $0
- Or small paid plan: $7/month
- PostgreSQL: $15/month
- Twilio: $0.0075/SMS (estimated $10-30/month)
- **Total: ~$25-45/month**

### Production
- Render Pro plan: $7/month (per service)
- PostgreSQL: $15/month (or more if needed)
- Twilio: $0.0075/SMS (estimate varies)
- Domain/DNS: $12/month
- Monitoring/alerts: $0 (Render built-in)
- **Total: ~$40-100+/month** (excluding SMS costs)

---

## Troubleshooting

### Deploy fails with "Missing environment variable"

```bash
# Check GitHub Secrets are set
GitHub → Settings → Secrets → Verify all secrets present

# Check Render environment variables
Render service → Environment → Verify variables added

# Check naming matches (case-sensitive)
DATABASE_URL not database_url
```

### Database connection refused

```bash
# Verify DATABASE_URL is correct
# Format: postgresql://user:password@host:5432/db

# Check database is running
curl postgresql://... (from Render dashboard)

# Check IP whitelist (if applicable)
Render → Database → Settings → Allowed IPs
```

### SMS not sending (Twilio)

```bash
# Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN correct
# Verify TWILIO_PHONE_NUMBER is valid
# Check Twilio account has credits
# Check phone number format: +COUNTRYCODEXXXXXXXXX
```

### CORS errors on frontend

```bash
# Update FRONTEND_URL to staging/production domain
GitHub Secrets → FRONTEND_URL → Update value

# Redeploy Render service
Render dashboard → Trigger manual deploy
```

---

## Next Steps

1. Test staging thoroughly
2. Get boss approval
3. Deploy to production
4. Submit to Google Play Store
5. Monitor logs and metrics
6. Plan v2.0 features based on feedback
