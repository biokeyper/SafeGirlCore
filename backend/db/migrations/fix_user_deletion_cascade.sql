-- Fix user deletion cascade constraints
-- Ensures all child records are deleted when a user is deleted
-- This prevents orphaned data in the database

-- Fix panic_alerts table (add ON DELETE CASCADE if missing)
ALTER TABLE panic_alerts DROP CONSTRAINT IF EXISTS panic_alerts_userid_fkey;
ALTER TABLE panic_alerts
  ADD CONSTRAINT panic_alerts_userid_fkey
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE;

-- Fix sms_queue table (add ON DELETE CASCADE if missing)
-- sms_queue links to users via user_id
ALTER TABLE sms_queue DROP CONSTRAINT IF EXISTS sms_queue_user_id_fkey;
ALTER TABLE sms_queue
  ADD CONSTRAINT sms_queue_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(userId) ON DELETE CASCADE;

-- Verify notifications has CASCADE (added in later migrations)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_userid_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_userid_fkey
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE;

-- Verify emergency_contacts has CASCADE
ALTER TABLE emergency_contacts DROP CONSTRAINT IF EXISTS emergency_contacts_userid_fkey;
ALTER TABLE emergency_contacts
  ADD CONSTRAINT emergency_contacts_userid_fkey
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE;

-- Verify panic_audit_log has CASCADE
ALTER TABLE panic_audit_log DROP CONSTRAINT IF EXISTS panic_audit_log_userid_fkey;
ALTER TABLE panic_audit_log
  ADD CONSTRAINT panic_audit_log_userid_fkey
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE;

-- Verify report_access has CASCADE
ALTER TABLE report_access DROP CONSTRAINT IF EXISTS report_access_reporterid_fkey;
ALTER TABLE report_access DROP CONSTRAINT IF EXISTS report_access_viewerid_fkey;
ALTER TABLE report_access
  ADD CONSTRAINT report_access_reporterid_fkey
  FOREIGN KEY (reporterId) REFERENCES users(userId) ON DELETE CASCADE;
ALTER TABLE report_access
  ADD CONSTRAINT report_access_viewerid_fkey
  FOREIGN KEY (viewerId) REFERENCES users(userId) ON DELETE CASCADE;

-- Verify otps has CASCADE
ALTER TABLE otps DROP CONSTRAINT IF EXISTS otps_userid_fkey;
ALTER TABLE otps
  ADD CONSTRAINT otps_userid_fkey
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE;

-- Create audit trail for user deletions
CREATE TABLE IF NOT EXISTS user_deletion_log (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  deletedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(255),
  deletedBy VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_user_deletion_log_userId ON user_deletion_log(userId);
CREATE INDEX IF NOT EXISTS idx_user_deletion_log_deletedAt ON user_deletion_log(deletedAt DESC);

GRANT SELECT, INSERT ON user_deletion_log TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE user_deletion_log_id_seq TO safegirl_user;
