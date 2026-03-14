-- Migration: Rename 'confirmed' status to 'submitted'
-- Updates submissions table and related views

-- 1. Update status column values from 'confirmed' to 'submitted'
UPDATE submissions
SET status = 'submitted'
WHERE status = 'confirmed';

-- 2. Rename confirmedAt column to submittedAt
ALTER TABLE submissions
RENAME COLUMN confirmedAt TO submittedAt;

-- 3. Drop the old view
DROP VIEW IF EXISTS confirmed_submissions;

-- 4. Create new view with updated name and status
CREATE VIEW submitted_submissions AS
SELECT * FROM submissions
WHERE status = 'submitted'
ORDER BY submittedAt DESC;
