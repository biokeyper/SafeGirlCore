-- Add panic audit logging for compliance and investigation

-- Update panic_alerts table (make txHash and blockNumber nullable for non-blocking approach)
ALTER TABLE panic_alerts ALTER COLUMN txHash DROP NOT NULL;

-- Create panic_audit_log table
CREATE TABLE IF NOT EXISTS panic_audit_log (
  id SERIAL PRIMARY KEY,
  alertId INTEGER NOT NULL,
  userId VARCHAR(255) NOT NULL,

  -- What action happened
  action VARCHAR(50) NOT NULL,
  -- Possible values: 'panic_created', 'sms_sent', 'sms_failed', 'blockchain_confirmed', 'blockchain_failed'

  -- Details about the action
  contactPhone VARCHAR(20),
  smsStatus VARCHAR(50),
  failureReason VARCHAR(255),
  metadata JSONB,

  -- Timestamps
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (alertId) REFERENCES panic_alerts(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_panic_audit_alertId ON panic_audit_log(alertId);
CREATE INDEX IF NOT EXISTS idx_panic_audit_userId ON panic_audit_log(userId);
CREATE INDEX IF NOT EXISTS idx_panic_audit_action ON panic_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_panic_audit_createdAt ON panic_audit_log(createdAt DESC);
