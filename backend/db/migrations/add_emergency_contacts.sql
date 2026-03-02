-- Add emergency contacts support and custom panic message

-- Add customPanicMessage column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS customPanicMessage VARCHAR(255);

-- Create emergency_contacts table if it doesn't exist
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  relationship VARCHAR(50),
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE,
  UNIQUE(userId, phone)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_emergency_userId ON emergency_contacts(userId);
CREATE INDEX IF NOT EXISTS idx_emergency_active ON emergency_contacts(userId, isActive);
CREATE INDEX IF NOT EXISTS idx_emergency_createdAt ON emergency_contacts(createdAt DESC);
