-- Create notifications table for user notifications system
-- Tracks all notifications (panic alerts, access grants, report submissions, etc)

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,              -- 'access_granted', 'panic_alert', 'report_submitted', etc
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  relatedId VARCHAR(255),                 -- reportId, accessId, alertId, etc
  isRead BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  readAt TIMESTAMP,

  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_notification_userId ON notifications(userId);
CREATE INDEX IF NOT EXISTS idx_notification_isRead ON notifications(isRead, userId);
CREATE INDEX IF NOT EXISTS idx_notification_createdAt ON notifications(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_notification_type ON notifications(type, userId);

-- Grant permissions to application user
GRANT SELECT, INSERT, UPDATE ON notifications TO safegirl_user;
GRANT USAGE, SELECT ON SEQUENCE notifications_id_seq TO safegirl_user;
