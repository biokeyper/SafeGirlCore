-- Add userId column to submissions table for access control
-- This allows owners to be identified and grants them automatic access to their reports

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS userid VARCHAR(255);

-- Create index on userid for faster lookups
CREATE INDEX IF NOT EXISTS idx_submissions_userid ON submissions(userid);

-- Add comment
COMMENT ON COLUMN submissions.userid IS 'User ID of the report owner (from JWT token)';
