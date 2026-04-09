-- Add user profile management columns
-- Allows users to set username and profile picture for better identification

-- Add username column (unique, for profile lookup)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;

-- Add profile picture URL column
ALTER TABLE users ADD COLUMN IF NOT EXISTS profilePicture TEXT;

-- Create index on username for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Create index on both username and userId for profile searches
CREATE INDEX IF NOT EXISTS idx_users_username_userId ON users(username, userId);

-- Grant permissions to application user
GRANT UPDATE ON users TO safegirl_user;
