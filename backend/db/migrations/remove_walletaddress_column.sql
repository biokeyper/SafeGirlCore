-- Remove unused walletaddress column from submissions table
-- This column was used in earlier architecture but has been replaced by userid

-- First drop dependent views
DROP VIEW IF EXISTS pending_submissions CASCADE;
DROP VIEW IF EXISTS confirmed_submissions CASCADE;

-- Then drop the column
ALTER TABLE submissions DROP COLUMN IF EXISTS walletaddress;
