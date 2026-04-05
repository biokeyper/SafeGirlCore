-- Report Share Links Table
-- Handles phone-based sharing with deep linking
-- Allows users to share reports without knowing recipient userIds
-- Supports both authenticated users and non-users via deep links

CREATE TABLE IF NOT EXISTS report_share_links (
  id SERIAL PRIMARY KEY,

  -- Report Information
  report_id VARCHAR(255) NOT NULL,        -- Reference to report being shared
  reporter_id VARCHAR(255) NOT NULL,      -- User who shared the report

  -- Share Token (for deep linking)
  share_token VARCHAR(255) NOT NULL UNIQUE,  -- Secure random token for deep link

  -- Recipient Information (flexible)
  recipient_phone VARCHAR(20),            -- Optional: specific phone number (E.164 format)
  recipient_user_id VARCHAR(255),         -- Optional: specific user ID (if exists)

  -- Share Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, claimed, expired
  claimed_by_user_id VARCHAR(255),        -- User who claimed the link (if not pre-assigned)
  claimed_at TIMESTAMP,                   -- When link was claimed

  -- Expiry & Limits
  expires_at TIMESTAMP NOT NULL,          -- When link expires (default 30 days)
  max_claims INTEGER DEFAULT 1,           -- Max number of times link can be used (1 = single use)
  claim_count INTEGER DEFAULT 0,          -- Number of times claimed

  -- Access Details
  access_expires_at TIMESTAMP,            -- When access to report expires (optional)
  access_level VARCHAR(50) DEFAULT 'view',  -- view, comment, etc. (future: can extend)

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  message TEXT                            -- Optional: message from sharer
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_share_links_token ON report_share_links(share_token);
CREATE INDEX IF NOT EXISTS idx_share_links_reporter ON report_share_links(reporter_id);
CREATE INDEX IF NOT EXISTS idx_share_links_recipient_phone ON report_share_links(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_share_links_status ON report_share_links(status);
CREATE INDEX IF NOT EXISTS idx_share_links_expires_at ON report_share_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_share_links_claimed_by ON report_share_links(claimed_by_user_id);

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_report_share_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_share_links_updated_at_trigger
BEFORE UPDATE ON report_share_links
FOR EACH ROW
EXECUTE FUNCTION update_report_share_links_updated_at();

-- Add comments for documentation
COMMENT ON TABLE report_share_links IS 'Secure share links for reports. Allows sharing via deep links without requiring recipient to be registered user. Auto-grants access upon sign-in.';
COMMENT ON COLUMN report_share_links.share_token IS 'Unique secure token for deep link (e.g., safegirl://share/abc123def456)';
COMMENT ON COLUMN report_share_links.status IS 'pending (not yet claimed), claimed (access granted), expired (past expiry date)';
COMMENT ON COLUMN report_share_links.recipient_phone IS 'Optional: for phone-specific shares (tracks who share link was sent to)';
COMMENT ON COLUMN report_share_links.claimed_by_user_id IS 'User who actually claimed the link (may differ from recipient if link was forwarded)';
COMMENT ON COLUMN report_share_links.max_claims IS 'How many times link can be used (1 = single use, null = unlimited)';
