-- Add critical indexes for production performance
-- These indexes significantly improve query performance on large datasets

-- Panic alerts: Queries filter by userId and sort by createdAt DESC
CREATE INDEX IF NOT EXISTS idx_panic_alerts_userId_createdAt
  ON panic_alerts(userId, createdAt DESC);

-- Notifications: Queries filter by userId, isRead, and sort by createdAt DESC
CREATE INDEX IF NOT EXISTS idx_notifications_userId_isRead_createdAt
  ON notifications(userId, isRead, createdAt DESC);

-- Submissions: Queries filter by userId and status
CREATE INDEX IF NOT EXISTS idx_submissions_userId_status
  ON submissions(userId, status);

-- Emergency contacts: Queries filter by userId
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_userId
  ON emergency_contacts(userId);

-- OTPs: Queries filter by phone and createdAt (for cleanup/verification)
CREATE INDEX IF NOT EXISTS idx_otps_phone_createdAt
  ON otps(phone, createdAt DESC);

-- Report access: Queries filter by reportId and granteeId
CREATE INDEX IF NOT EXISTS idx_report_access_reportId_granteeId
  ON report_access(reportId, granteeId);

-- Share links: Queries filter by token and expiry
CREATE INDEX IF NOT EXISTS idx_report_share_links_token_expiry
  ON report_share_links(token, expiresAt);

-- SMS queue: Queries filter by status and createdAt (for retry processing)
CREATE INDEX IF NOT EXISTS idx_sms_queue_status_createdAt
  ON sms_queue(status, createdAt);
