-- Add country field to users table
-- Tracks which country the user is from for multi-country support

ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(2);

-- Create index for country filtering
CREATE INDEX IF NOT EXISTS idx_users_country ON users(country);

-- Update init.sql to include this field for new databases
-- Note: Existing databases will use this migration
