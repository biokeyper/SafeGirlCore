-- Add OTP Account Lockout Protection
-- Prevents brute force attacks with escalating lockout durations
-- 1st lockout: 5 minutes
-- 2nd lockout: 10 minutes
-- 3rd lockout: 1 hour
-- 4th+ lockout: 2 hours

ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_failed_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_lockout_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_lockout_count INTEGER DEFAULT 0;

-- Create index for efficient lockout checks
CREATE INDEX IF NOT EXISTS idx_users_otp_lockout ON users(phone, otp_lockout_until);

-- Add comment explaining the columns
COMMENT ON COLUMN users.otp_failed_attempts IS 'Count of failed OTP verification attempts. Reset to 0 on successful verification.';
COMMENT ON COLUMN users.otp_lockout_until IS 'Timestamp until which the account is locked from OTP verification. NULL means not locked.';
COMMENT ON COLUMN users.otp_lockout_count IS 'Number of times user has been locked out. Used to escalate lockout duration (5min → 10min → 1hr → 2hrs).';
