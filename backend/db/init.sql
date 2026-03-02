-- SafeGirl Database Initialization
-- This file runs automatically when PostgreSQL container starts

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create submissions table
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,

  -- Report identification
  reportId VARCHAR(255) UNIQUE NOT NULL,

  -- Blockchain data
  txHash VARCHAR(255) UNIQUE NOT NULL,
  blockNumber BIGINT,
  gasUsed VARCHAR(255),

  -- IPFS data
  ipfsHash VARCHAR(255),

  -- Report responses
  responses TEXT[],

  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, confirmed, failed

  -- Metadata
  walletAddress VARCHAR(255),
  metadata JSONB,

  -- Timestamps
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmedAt TIMESTAMP,

  -- Encryption keys (for backend-side decryption)
  encryptionKey VARCHAR(255),           -- Encrypted report key (hex)
  encryptionKeyIv VARCHAR(255),         -- IV for key encryption (hex)
  encryptionKeyAuthTag VARCHAR(255),    -- Auth tag for key encryption (hex)
  encryptionDataIv VARCHAR(255),        -- IV for data encryption (hex)
  encryptionDataAuthTag VARCHAR(255),   -- Auth tag for data encryption (hex)

  -- Archival (for privacy, but keeps blockchain record intact)
  isArchived BOOLEAN DEFAULT FALSE,
  archivedAt TIMESTAMP,
  archivedReason VARCHAR(255)
);

-- Create index on reportId for fast lookups
CREATE INDEX idx_submissions_reportId ON submissions(reportId);

-- Create index on status for filtering
CREATE INDEX idx_submissions_status ON submissions(status);

-- Create index on txHash for blockchain verification
CREATE INDEX idx_submissions_txHash ON submissions(txHash);

-- Create index on createdAt for time-based queries
CREATE INDEX idx_submissions_createdAt ON submissions(createdAt DESC);

-- Create a function to automatically update the updatedAt timestamp
CREATE OR REPLACE FUNCTION update_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedAt = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the update function
CREATE TRIGGER submissions_updated_at_trigger
BEFORE UPDATE ON submissions
FOR EACH ROW
EXECUTE FUNCTION update_submissions_updated_at();

-- Create a view for pending submissions (useful for monitoring)
CREATE VIEW pending_submissions AS
SELECT * FROM submissions
WHERE status = 'pending'
ORDER BY createdAt DESC;

-- Create a view for confirmed submissions
CREATE VIEW confirmed_submissions AS
SELECT * FROM submissions
WHERE status = 'confirmed'
ORDER BY confirmedAt DESC;

-- ========== AUDIT LOG TABLE ==========
-- Tracks all changes to submissions for security investigation
CREATE TABLE IF NOT EXISTS submission_audit_log (
  id SERIAL PRIMARY KEY,
  reportId VARCHAR(255) NOT NULL,

  -- What changed
  fieldChanged VARCHAR(100),
  oldValue VARCHAR(255),
  newValue VARCHAR(255),

  -- Why it changed
  changeReason VARCHAR(50) NOT NULL DEFAULT 'unknown',
  -- Possible values: 'api_update', 'blockchain_sync', 'tampering_detected', 'system_fix'

  -- Security info
  changedBy VARCHAR(100),  -- 'system', 'api', 'background_job', etc.

  -- Timestamps
  changedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (reportId) REFERENCES submissions(reportId)
);

-- Index for fast lookups by reportId and reason
CREATE INDEX idx_audit_reportId ON submission_audit_log(reportId);
CREATE INDEX idx_audit_reason ON submission_audit_log(changeReason);
CREATE INDEX idx_audit_changedAt ON submission_audit_log(changedAt DESC);

-- ========== TAMPERING ALERTS TABLE ==========
-- When we detect a mismatch, alert the user
CREATE TABLE IF NOT EXISTS tampering_alerts (
  id SERIAL PRIMARY KEY,
  reportId VARCHAR(255) NOT NULL UNIQUE,

  -- What we detected
  dbValue VARCHAR(255),
  blockchainValue VARCHAR(255),

  -- What we did
  correctionApplied BOOLEAN DEFAULT FALSE,

  -- Metadata
  detectedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  correctedAt TIMESTAMP,

  FOREIGN KEY (reportId) REFERENCES submissions(reportId)
);

CREATE INDEX idx_alerts_reportId ON tampering_alerts(reportId);
CREATE INDEX idx_alerts_detected ON tampering_alerts(detectedAt DESC);

-- ========== USERS TABLE ==========
-- Stores user authentication data (OTP-based)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) UNIQUE NOT NULL,        -- Unique user identifier (UUID)
  phone VARCHAR(20) UNIQUE NOT NULL,          -- User's phone number (primary auth)
  email VARCHAR(255) UNIQUE,                  -- User's email (recovery method)
  phone_verified BOOLEAN DEFAULT FALSE,       -- Phone verification status
  email_verified BOOLEAN DEFAULT FALSE,       -- Email verification status
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastLogin TIMESTAMP,
  lastPhoneChange TIMESTAMP,                  -- Track when phone last changed
  pin VARCHAR(6),                             -- Content lock PIN (1-6 digits, optional)
  customPanicMessage VARCHAR(255)             -- Custom message for emergency contacts on panic alert
);

-- Create indexes for fast lookups
CREATE INDEX idx_users_userId ON users(userId);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);

-- ========== EMERGENCY CONTACTS TABLE ==========
-- Stores emergency contacts for panic alerts
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) NOT NULL,              -- User who configured this contact
  phone VARCHAR(20) NOT NULL,                -- Contact's phone number
  name VARCHAR(255),                         -- Contact's name (from device contacts)
  relationship VARCHAR(50),                  -- Relationship: "mother", "friend", "police", etc.
  isActive BOOLEAN DEFAULT TRUE,             -- Whether to send alerts to this contact
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE,
  UNIQUE(userId, phone)                      -- One entry per user-contact combo
);

-- Create indexes for fast lookups
CREATE INDEX idx_emergency_userId ON emergency_contacts(userId);
CREATE INDEX idx_emergency_active ON emergency_contacts(userId, isActive);
CREATE INDEX idx_emergency_createdAt ON emergency_contacts(createdAt DESC);

-- ========== OTP TABLE ==========
-- Stores one-time passwords for authentication
CREATE TABLE IF NOT EXISTS otps (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255),                        -- Associated user (can be NULL for signup)
  phone VARCHAR(20) NOT NULL,                 -- Phone number OTP was sent to
  otp_code VARCHAR(6) NOT NULL,               -- 6-digit OTP
  otp_type VARCHAR(50) NOT NULL,              -- 'signup', 'login', 'phone_change', 'recovery'
  attempts INT DEFAULT 0,                     -- Failed attempt counter
  max_attempts INT DEFAULT 3,                 -- Max attempts allowed
  is_used BOOLEAN DEFAULT FALSE,              -- Mark as used after verification
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,              -- OTP expiry (5 minutes)
  verified_at TIMESTAMP,                      -- When OTP was verified

  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);

-- Create indexes for OTP lookups
CREATE INDEX idx_otp_phone ON otps(phone);
CREATE INDEX idx_otp_userId ON otps(userId);
CREATE INDEX idx_otp_type ON otps(otp_type);
CREATE INDEX idx_otp_expires ON otps(expires_at);

-- ========== RECOVERY TOKENS TABLE ==========
-- Stores email-based account recovery tokens
CREATE TABLE IF NOT EXISTS recovery_tokens (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,        -- Random recovery token
  token_type VARCHAR(50) NOT NULL,           -- 'phone_recovery', 'email_recovery'
  new_phone VARCHAR(20),                     -- Proposed new phone (for phone recovery)
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,             -- Token expiry (24 hours)
  used_at TIMESTAMP,

  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);

-- Create indexes for recovery token lookups
CREATE INDEX idx_recovery_token ON recovery_tokens(token);
CREATE INDEX idx_recovery_userId ON recovery_tokens(userId);
CREATE INDEX idx_recovery_expires ON recovery_tokens(expires_at);

-- ========== NOTIFICATIONS TABLE ==========
-- Tracks all notifications for users
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,              -- 'access_granted', 'panic_alert', 'report_submitted', etc
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  relatedId VARCHAR(255),                 -- reportId, accessId, etc
  isRead BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  readAt TIMESTAMP,

  FOREIGN KEY (userId) REFERENCES users(userId)
);

CREATE INDEX idx_notification_userId ON notifications(userId);
CREATE INDEX idx_notification_isRead ON notifications(isRead, userId);
CREATE INDEX idx_notification_createdAt ON notifications(createdAt DESC);
CREATE INDEX idx_notification_type ON notifications(type, userId);

-- ========== PANIC ALERTS TABLE ==========
-- Tracks emergency panic alerts sent by users
CREATE TABLE IF NOT EXISTS panic_alerts (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) NOT NULL,
  walletAddress VARCHAR(255),
  locationData VARCHAR(500) NOT NULL,
  txHash VARCHAR(255) UNIQUE NOT NULL,
  blockNumber BIGINT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (userId) REFERENCES users(userId)
);

CREATE INDEX idx_panic_userId ON panic_alerts(userId);
CREATE INDEX idx_panic_createdAt ON panic_alerts(createdAt DESC);

-- ========== KEY RECOVERY TABLE ==========
-- Stores encrypted backup of encryption keys for recovery
CREATE TABLE IF NOT EXISTS key_backups (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) NOT NULL UNIQUE,
  encryptedKey VARCHAR(255) NOT NULL,        -- Backup key encrypted with PIN
  keyIv VARCHAR(255) NOT NULL,               -- IV for key encryption
  keyAuthTag VARCHAR(255) NOT NULL,          -- Auth tag for key encryption
  pinHash VARCHAR(255) NOT NULL,             -- Hashed PIN (SHA-256)
  backupCreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastRecoveryAttempt TIMESTAMP,
  recoveryAttempts INT DEFAULT 0,

  FOREIGN KEY (userId) REFERENCES users(userId)
);

CREATE INDEX idx_backup_userId ON key_backups(userId);
CREATE INDEX idx_backup_createdAt ON key_backups(backupCreatedAt DESC);

-- ========== REPORT ACCESS TABLE ==========
-- Tracks who has access to which reports (for sharing)
CREATE TABLE IF NOT EXISTS report_access (
  id SERIAL PRIMARY KEY,
  reportId VARCHAR(255) NOT NULL,
  reporterId VARCHAR(255) NOT NULL,          -- User who submitted the report
  viewerId VARCHAR(255) NOT NULL,            -- User who has been granted access
  grantedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt TIMESTAMP,                       -- Optional expiry time
  isActive BOOLEAN DEFAULT TRUE,             -- Track if access is still valid
  revokedAt TIMESTAMP,                       -- When access was revoked

  FOREIGN KEY (reportId) REFERENCES submissions(reportId),
  UNIQUE(reportId, reporterId, viewerId)     -- One access per (report, reporter, viewer) combo
);

-- Create indexes for fast lookups
CREATE INDEX idx_access_reportId ON report_access(reportId);
CREATE INDEX idx_access_viewerId ON report_access(viewerId);
CREATE INDEX idx_access_reporterId ON report_access(reporterId);
CREATE INDEX idx_access_active ON report_access(isActive, viewerId);

-- Grant permissions to application user
GRANT SELECT, INSERT, UPDATE ON submissions TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE submissions_id_seq TO safegirl_user;
GRANT INSERT ON submission_audit_log TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE submission_audit_log_id_seq TO safegirl_user;
GRANT INSERT, SELECT ON tampering_alerts TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE tampering_alerts_id_seq TO safegirl_user;
GRANT SELECT ON pending_submissions TO safegirl_user;
GRANT SELECT ON confirmed_submissions TO safegirl_user;
GRANT SELECT, INSERT, UPDATE ON users TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO safegirl_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON emergency_contacts TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE emergency_contacts_id_seq TO safegirl_user;
GRANT SELECT, INSERT, UPDATE ON otps TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE otps_id_seq TO safegirl_user;
GRANT SELECT, INSERT, UPDATE ON recovery_tokens TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE recovery_tokens_id_seq TO safegirl_user;
GRANT SELECT, INSERT, UPDATE ON report_access TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE report_access_id_seq TO safegirl_user;
GRANT SELECT, INSERT ON panic_alerts TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE panic_alerts_id_seq TO safegirl_user;
GRANT SELECT, INSERT, UPDATE ON notifications TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE notifications_id_seq TO safegirl_user;
GRANT SELECT, INSERT, UPDATE ON key_backups TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE key_backups_id_seq TO safegirl_user;
