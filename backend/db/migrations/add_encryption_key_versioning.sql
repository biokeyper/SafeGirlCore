-- Add Encryption Key Versioning Support
-- Enables master key rotation without downtime

-- Add key_version column to submissions table
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS key_version INTEGER DEFAULT 1;

-- Create index for efficient filtering by key version
CREATE INDEX IF NOT EXISTS idx_submissions_key_version ON submissions(key_version);

-- Add comment explaining the column
COMMENT ON COLUMN submissions.key_version IS 'Version of encryption master key used to encrypt this report (1=original, 2+=rotated keys). Used during key rotation migrations.';

-- ========== OPTIONAL: Encryption Key Audit Trail Table ==========
-- Uncomment to enable full audit trail of all key rotations
-- This is recommended for production to track all encryption key changes

CREATE TABLE IF NOT EXISTS encryption_key_audit (
  id SERIAL PRIMARY KEY,
  key_version INTEGER UNIQUE NOT NULL,
  key_hash VARCHAR(64) NOT NULL,  -- SHA256 hash of key for audit trail (never store actual key)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT FALSE,   -- Can decrypt with this key
  rotated_at TIMESTAMP,           -- When rotation from this key completed
  rotated_by VARCHAR(255),        -- Who rotated (e.g., 'automated', 'admin_name')
  rotation_reason TEXT,           -- Why rotated (e.g., 'scheduled', 'emergency', 'compromise')
  notes TEXT                      -- Additional notes
);

-- Ensure only one active key at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_encryption_key ON encryption_key_audit(is_active) WHERE is_active = true;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_encryption_key_version ON encryption_key_audit(key_version);
CREATE INDEX IF NOT EXISTS idx_encryption_key_created ON encryption_key_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_encryption_key_rotated ON encryption_key_audit(rotated_at DESC);

-- Add comments
COMMENT ON TABLE encryption_key_audit IS 'Audit trail of all encryption master key versions used. Never stores actual keys, only hashes and metadata.';
COMMENT ON COLUMN encryption_key_audit.key_version IS 'Sequential version number (1=original, 2=first rotation, etc)';
COMMENT ON COLUMN encryption_key_audit.key_hash IS 'SHA256 hash of key for verification (not decryptable, audit purpose only)';
COMMENT ON COLUMN encryption_key_audit.is_active IS 'Whether this key is currently active (true=in use for encryption/decryption)';
COMMENT ON COLUMN encryption_key_audit.rotated_at IS 'When rotation from this key was completed (all data re-encrypted)';
COMMENT ON COLUMN encryption_key_audit.rotated_by IS 'Who initiated the rotation (for audit trail)';
COMMENT ON COLUMN encryption_key_audit.rotation_reason IS 'Reason for rotation (scheduled 30-day rotation, emergency compromise response, etc)';
