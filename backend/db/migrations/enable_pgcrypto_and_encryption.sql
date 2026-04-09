-- Enable pgcrypto extension for encryption at rest
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted phone column to users table (for sensitive storage)
-- Note: Keep original phone for lookups, add encrypted version for audit trail
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;

-- Add encrypted emergency contact phone numbers to emergency_contacts table
ALTER TABLE emergency_contacts ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;

-- Function to encrypt phone numbers using pgcrypto
-- Usage: SELECT pgp_sym_encrypt('phone_number', 'encryption_key')
-- Note: In practice, encryption_key should come from application config
CREATE OR REPLACE FUNCTION encrypt_phone(phone_text TEXT, key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_encrypt(phone_text, key);
END;
$$ LANGUAGE plpgsql;

-- Function to decrypt phone numbers
CREATE OR REPLACE FUNCTION decrypt_phone(encrypted_text TEXT, key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(encrypted_text, key);
END;
$$ LANGUAGE plpgsql;

-- Create index on encrypted phone for performance
-- (encrypted values are deterministic with same key, so indexing works)
CREATE INDEX IF NOT EXISTS idx_users_phone_encrypted ON users(phone_encrypted);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_phone_encrypted ON emergency_contacts(phone_encrypted);

-- Add audit columns to track encryption status
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_phone_encrypted BOOLEAN DEFAULT FALSE;
ALTER TABLE emergency_contacts ADD COLUMN IF NOT EXISTS is_phone_encrypted BOOLEAN DEFAULT FALSE;
