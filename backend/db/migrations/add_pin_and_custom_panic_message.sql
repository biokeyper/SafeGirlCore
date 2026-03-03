-- Add PIN column for content lock and customPanicMessage to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS pin VARCHAR(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS customPanicMessage VARCHAR(255);
