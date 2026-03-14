-- Add confirmations column to track blockchain confirmations (0-12+)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS confirmations INTEGER DEFAULT 0;

-- Create index for filtering pending reports
CREATE INDEX IF NOT EXISTS idx_submissions_confirmations ON submissions(confirmations);
