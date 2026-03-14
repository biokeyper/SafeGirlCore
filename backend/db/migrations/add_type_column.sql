-- Add type column to submissions table for report type (audio/text)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'text';

-- Create index on type for filtering
CREATE INDEX IF NOT EXISTS idx_submissions_type ON submissions(type);
