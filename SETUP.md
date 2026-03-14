# SafeGirl Backend - Development Setup Guide

## Prerequisites

- **Node.js**: v18+ (LTS recommended)
- **Docker**: For PostgreSQL and Hardhat local node
- **PostgreSQL**: v13+ (or via Docker)
- **Git**: For version control
- **npm**: v9+ (comes with Node.js)

### Verify Installation

```bash
node --version      # Should be v18+
npm --version       # Should be v9+
docker --version    # Should show version
psql --version      # If installing PostgreSQL locally
```

---

## Environment Variables

Create a `.env` file in the `backend/` directory with the following variables:

### Database Configuration

```env
# PostgreSQL Connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=safegirl_db
DB_USER=safegirl_user
DB_PASSWORD=your_secure_password_here

# Database Pool (optional)
DB_POOL_MIN=2
DB_POOL_MAX=10
```

### JWT & Security

```env
# JWT Secret (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
JWT_SECRET=RLStZy7QZ+scwSQv/Scbc5wvCGagST5ouu2KFP0P3gY=

# Token Expiry (in seconds)
JWT_EXPIRY=604800  # 7 days
```

### Blockchain (Polygon Mumbai)

```env
# Hardhat Local Node
BLOCKCHAIN_RPC_URL=http://localhost:8545

# Company Wallet (Private Key)
WEB3_PRIVATE_KEY=0x...your_private_key_here...

# Contract Address (after deployment)
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

# Deployed on Polygon Mumbai via Hardhat
BLOCKCHAIN_NETWORK=mumbai
```

### IPFS (Pinata)

```env
# Pinata API Keys
PINATA_API_KEY=your_pinata_api_key
PINATA_API_SECRET=your_pinata_api_secret
PINATA_JWT=your_pinata_jwt_token

# Web3.storage Backup
WEB3_STORAGE_TOKEN=your_web3_storage_token
```

### SMS & Email

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+256...your_twilio_number...

# Phone Number Prefix (Uganda)
PHONE_PREFIX=256
PHONE_PREFIX_LOCAL=0

# Gmail SMTP (for recovery emails)
GMAIL_USER=nagujjamariam300@gmail.com
GMAIL_APP_PASSWORD=your_app_password_here
```

### Server Configuration

```env
# Express Server
PORT=3001
NODE_ENV=development
LOG_LEVEL=debug

# Payload Size Limit
MAX_PAYLOAD_SIZE=10mb

# Frontend URL (CORS)
FRONTEND_URL=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

### Optional Configuration

```env
# Feature Flags
ENABLE_EVENT_LISTENER=false  # Use database logging instead
ENABLE_BLOCKCHAIN_SYNC=true
ENABLE_SMS_NOTIFICATIONS=true

# Retry Configuration
MAX_BLOCKCHAIN_RETRIES=3
BLOCKCHAIN_RETRY_DELAY_MS=1000

# Timeouts (milliseconds)
IPFS_UPLOAD_TIMEOUT=30000
BLOCKCHAIN_CONFIRMATION_TIMEOUT=120000
```

---

## Database Setup

### Option 1: Docker Compose (Recommended)

```bash
# Start PostgreSQL container
docker-compose up -d postgres

# Verify container is running
docker ps | grep postgres

# Check logs
docker logs safegirl-postgres
```

The `docker-compose.yml` file should configure:
- Container: `safegirl-postgres`
- Database: `safegirl_db`
- User: `safegirl_user`
- Port: `5432`

### Option 2: Local PostgreSQL Installation

```bash
# macOS (Homebrew)
brew install postgresql
brew services start postgresql

# Linux (Ubuntu)
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql

# Verify
psql --version
```

### Initialize Database Schema

```bash
# Create database and user
createdb -U postgres safegirl_db

createuser -U postgres safegirl_user
psql -U postgres -c "ALTER USER safegirl_user WITH PASSWORD 'your_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE safegirl_db TO safegirl_user;"
```

### Run Initial Schema

```bash
# Navigate to backend directory
cd backend/

# Run init script
psql -U safegirl_user -d safegirl_db -f db/init.sql

# Verify tables created
psql -U safegirl_user -d safegirl_db -c "\dt"
```

### Run Migrations (for new installations)

```bash
# Migrations run in order - maintain this sequence:
psql -U safegirl_user -d safegirl_db -f db/migrations/add_pin_column.sql
psql -U safegirl_user -d safegirl_db -f db/migrations/add_emergency_contacts.sql
psql -U safegirl_user -d safegirl_db -f db/migrations/add_panic_audit_log.sql
psql -U safegirl_user -d safegirl_db -f db/migrations/add_notifications_table.sql
psql -U safegirl_user -d safegirl_db -f db/migrations/add_pin_and_custom_panic_message.sql
psql -U safegirl_user -d safegirl_db -f db/migrations/add_userid_to_submissions.sql
psql -U safegirl_user -d safegirl_db -f db/migrations/remove_walletaddress_column.sql
```

### Verify Schema

```bash
# Connect to database
psql -U safegirl_user -d safegirl_db

# List all tables
\dt

# Describe a table
\d submissions

# View table count
SELECT count(*) FROM information_schema.tables WHERE table_schema='public';

# Exit
\q
```

---

## Blockchain Setup (Hardhat Local Node)

### Deploy Smart Contract

```bash
# Navigate to project root
cd /home/mirembe/Desktop/Projects/SafeGirlCore

# Install Hardhat dependencies (if not already done)
npm install --save-dev hardhat @openzeppelin/contracts

# Start Hardhat local node (Terminal 1)
npx hardhat node

# Expected output:
# > Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
# > Accounts generated with mnemonic: "test test test..."

# Deploy contract (Terminal 2)
npx hardhat run scripts/deploy.js --network localhost

# Expected output:
# > SafeGirl contract deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
# > Owner: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

### Update Backend Configuration

After deployment, copy the contract address to your `.env`:

```env
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### Verify Hardhat Connection

```bash
# Test blockchain connection
node -e "
const { ethers } = require('ethers');
const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
provider.getBlockNumber().then(num => console.log('Connected! Block:', num));
"
```

---

## Dependencies Installation

### Install Backend Dependencies

```bash
cd backend/

# Install all npm packages
npm install

# Verify installation
npm list --depth=0
```

### Key Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.0",           // Web framework
    "cors": "^2.8.5",                // CORS middleware
    "jsonwebtoken": "^9.0.0",        // JWT tokens
    "bcryptjs": "^2.4.3",            // Password hashing
    "ethers": "^6.0.0",              // Ethereum/blockchain
    "axios": "^1.4.0",               // HTTP requests
    "dotenv": "^16.0.0",             // Environment variables
    "pg": "^8.10.0",                 // PostgreSQL client
    "twilio": "^3.74.0",             // SMS service
    "nodemailer": "^6.9.0",          // Email service
    "multer": "^1.4.5-lts.1"         // File uploads
  },
  "devDependencies": {
    "jest": "^29.0.0",               // Testing framework
    "supertest": "^6.3.0"            // HTTP testing
  }
}
```

---

## Running the Server

### Development Mode (with auto-restart)

```bash
cd backend/

# Install nodemon (if not already installed)
npm install --save-dev nodemon

# Start server with auto-reload
npm run dev

# Expected output:
# > Server started
# > Initializing services...
# > All services initialized successfully
# > API Endpoints:
# >   AUTH (OTP-based):
# >     POST   /api/auth/signup/initiate
# >     POST   /api/auth/signup/verify
# >     ...
# > Logs saved to: backend/logs/
```

### Production Mode

```bash
cd backend/

# Build/start server (no auto-reload)
npm start

# Verify with curl
curl http://localhost:3001/

# Expected response:
# {
#   "name": "SafeGirl Backend API",
#   "version": "1.0.0",
#   "status": "running",
#   "endpoints": { ... }
# }
```

### Check Logs

```bash
# View recent logs
tail -f backend/logs/app.log

# View errors
tail -f backend/logs/errors.log

# Search for specific errors
grep "ERROR" backend/logs/app.log | tail -20
```

---

## Running Tests

### Unit Tests

```bash
cd backend/

# Run all tests
npm test

# Run specific test file
npm test -- reportController.test.js

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

### Integration Tests

```bash
# Requires running services (DB, blockchain, IPFS)
npm run test:integration
```

### Manual API Testing

```bash
# 1. Signup
curl -X POST http://localhost:3001/api/auth/signup/initiate \
  -H "Content-Type: application/json" \
  -d '{"phone": "0750902921"}'

# 2. Verify OTP (use OTP from logs or Twilio)
curl -X POST http://localhost:3001/api/auth/signup/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "0750902921", "otp": "123456"}'

# 3. Submit Report (with JWT from signup)
curl -X POST http://localhost:3001/api/submitReport \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {"title": "Test", "description": "Test incident"},
    "responses": ["Yes", "Answer 2", "Answer 3", "Answer 4", "Answer 5"]
  }'
```

---

## Deployment Checklist

### Environment Hardening (Production)

```env
# Security
NODE_ENV=production
JWT_SECRET=<generate-new-secure-random-key>
DB_PASSWORD=<use-strong-password>
WEB3_PRIVATE_KEY=<use-production-key>

# Disable dangerous operations
ENABLE_EVENT_LISTENER=false
DEBUG_MODE=false

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS - restrict to your domain
FRONTEND_URL=https://safegirl.example.com
ALLOWED_ORIGINS=https://safegirl.example.com,https://www.safegirl.example.com
```

### Database

- [ ] Backup database before deployment
- [ ] Run migrations on production DB
- [ ] Set up automated backups (daily)
- [ ] Enable SSL connections
- [ ] Restrict database access by IP
- [ ] Use strong passwords (30+ chars)
- [ ] Enable query logging for audit trail

### Blockchain

- [ ] Deploy contract to Polygon mainnet (not testnet)
- [ ] Verify contract source code on Polygonscan
- [ ] Use mainnet RPC (Infura/Alchemy)
- [ ] Secure private key in HSM or key management service
- [ ] Set up transaction monitoring
- [ ] Configure gas price strategy (not hardcoded)

### Infrastructure

- [ ] Deploy on HTTPS only (TLS 1.3)
- [ ] Set up load balancer for multiple instances
- [ ] Configure auto-scaling based on CPU/memory
- [ ] Set up CDN for frontend assets
- [ ] Enable request logging (with privacy considerations)
- [ ] Set up monitoring and alerting
- [ ] Configure DDoS protection

### Secrets Management

```bash
# Use environment variable management service
# DO NOT commit secrets to git

# Option 1: AWS Secrets Manager
aws secretsmanager create-secret --name safegirl/backend --secret-string file://secrets.json

# Option 2: HashiCorp Vault
vault write secret/safegirl jwt_secret=... db_password=...

# Option 3: GitHub Actions Secrets
# Set in repository settings, reference with ${{ secrets.JWT_SECRET }}
```

### Monitoring & Logging

```bash
# Set up centralized logging
# - CloudWatch (AWS)
# - DataDog
# - Loggly
# - ELK Stack

# Metrics to track
# - Request latency (p50, p95, p99)
# - Error rate (4xx, 5xx)
# - Database connection pool usage
# - Blockchain transaction confirmation time
# - IPFS upload latency
# - SMS delivery rate
```

### Verification Steps

```bash
# Health check
curl https://api.safegirl.example.com/api/health

# Verify blockchain connection
curl -X GET https://api.safegirl.example.com/api/health | jq '.blockchain'

# Test signup flow (using test phone number)
curl -X POST https://api.safegirl.example.com/api/auth/signup/initiate \
  -H "Content-Type: application/json" \
  -d '{"phone": "+256750000000"}'
```

---

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
psql -U safegirl_user -d safegirl_db -c "SELECT 1"

# Check PostgreSQL is running
docker ps | grep postgres
ps aux | grep postgres

# View connection logs
docker logs safegirl-postgres

# Reset connection (if stuck)
docker restart safegirl-postgres
```

### Blockchain Connection Issues

```bash
# Verify Hardhat is running
curl http://localhost:8545

# Check block number
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Restart Hardhat node
pkill -f "hardhat node"
npx hardhat node
```

### IPFS Upload Failures

```bash
# Test Pinata connection
curl -i --request GET "https://api.pinata.cloud/data/testAuthentication" \
  --header "Authorization: Bearer $PINATA_JWT"

# Check API key permissions
# Verify PINATA_API_KEY, PINATA_API_SECRET, PINATA_JWT are set
```

### Email/SMS Not Sending

```bash
# Verify Twilio credentials
node -e "
const twilio = require('twilio');
const client = twilio('YOUR_ACCOUNT_SID', 'YOUR_AUTH_TOKEN');
client.api.accounts.list().then(data => console.log('Twilio OK'));
"

# Verify Gmail app password
# 1. Enable 2FA on Gmail account
# 2. Generate app-specific password
# 3. Use that password in GMAIL_APP_PASSWORD env var
```

### OTP Not Received

```bash
# Check Twilio logs
# - Message delivery status
# - Bounce rates
# - Country restrictions

# Verify phone format
# Valid formats: +256750902921, 0750902921, 256750902921
# Invalid: +1-256-750-902921 (extra formatting)

# Check rate limits in code
# Default: 5 attempts per 15 minutes per phone
```

### Encryption Errors

```bash
# Test encryption/decryption
node -e "
const crypto = require('crypto');
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = cipher.update('test', 'utf8', 'hex');
console.log('Encryption working');
"

# Verify JWT_SECRET is set and not empty
echo $JWT_SECRET  # Should output a base64 string
```

---

## Development Workflow

### Typical Development Session

```bash
# Terminal 1: Start database
docker-compose up postgres

# Terminal 2: Start blockchain
npx hardhat node

# Terminal 3: Start backend server
cd backend
npm run dev

# Terminal 4: Frontend (optional)
cd frontend
npm start

# Terminal 5: Make requests
curl -X POST http://localhost:3001/api/auth/signup/initiate \
  -H "Content-Type: application/json" \
  -d '{"phone": "0750902921"}'
```

### Debugging

```bash
# Enable debug logging
DEBUG=safegirl:* npm run dev

# Add breakpoints in code
debugger;

# Run with Node debugger
node --inspect-brk server.js
# Then open chrome://inspect/
```

### Code Style

```bash
# Check code style
npm run lint

# Fix style issues
npm run lint:fix

# Format code
npm run format
```

---

## Additional Resources

- **OpenAPI Spec**: `openapi.yaml` (import to Swagger UI)
- **Architecture**: `ARCHITECTURE.md`
- **Database Schema**: `DATABASE.md`
- **API Examples**: See integration tests in `tests/`
- **Smart Contract**: `contracts/SafeGirl.sol`
