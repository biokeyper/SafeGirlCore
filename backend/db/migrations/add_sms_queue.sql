-- SMS Retry Queue Table
-- Stores failed SMS sends for automatic retry
-- Ensures emergency contacts are notified even if SMS temporarily fails

CREATE TABLE IF NOT EXISTS sms_queue (
  id SERIAL PRIMARY KEY,

  -- SMS Identification
  alert_id VARCHAR(255) NOT NULL,        -- Reference to panic alert
  user_id VARCHAR(255) NOT NULL,          -- User who triggered panic
  recipient_phone VARCHAR(20) NOT NULL,   -- Phone number to send to

  -- Message Content
  message TEXT NOT NULL,                  -- SMS message body

  -- Retry Tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, sent, failed_exhausted
  retry_count INTEGER DEFAULT 0,                  -- Number of retry attempts
  max_retries INTEGER DEFAULT 3,                  -- Maximum retry attempts allowed
  last_retry_at TIMESTAMP,                       -- When last retry was attempted
  next_retry_at TIMESTAMP,                       -- When to retry next

  -- Error Tracking
  last_error VARCHAR(255),                -- Last error message (if any)

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP,                     -- When SMS was successfully sent
  failed_at TIMESTAMP                    -- When marked as permanently failed
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_sms_queue_status ON sms_queue(status);
CREATE INDEX IF NOT EXISTS idx_sms_queue_next_retry ON sms_queue(next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sms_queue_alert_id ON sms_queue(alert_id);
CREATE INDEX IF NOT EXISTS idx_sms_queue_user_id ON sms_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_queue_created_at ON sms_queue(created_at DESC);

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sms_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sms_queue_updated_at_trigger
BEFORE UPDATE ON sms_queue
FOR EACH ROW
EXECUTE FUNCTION update_sms_queue_updated_at();

-- Add comments for documentation
COMMENT ON TABLE sms_queue IS 'Queue for SMS sends that failed and need to be retried. Ensures emergency contacts get panic alert notifications even if Twilio is temporarily unavailable.';
COMMENT ON COLUMN sms_queue.status IS 'Status: pending (waiting to send), sent (successfully sent), failed_exhausted (max retries exceeded, permanently failed)';
COMMENT ON COLUMN sms_queue.retry_count IS 'Number of times this SMS has been attempted (0 = first attempt, 3 = exhausted retries)';
COMMENT ON COLUMN sms_queue.next_retry_at IS 'Timestamp when this SMS should be retried next (exponential backoff)';
