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
  txHash VARCHAR(255),
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
  confirmedAt TIMESTAMP
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

-- Grant permissions to application user
GRANT SELECT, INSERT, UPDATE ON submissions TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE submissions_id_seq TO safegirl_user;
GRANT SELECT ON pending_submissions TO safegirl_user;
GRANT SELECT ON confirmed_submissions TO safegirl_user;
