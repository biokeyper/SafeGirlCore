-- Add PIN column to users table for content lock feature
-- This migration is for existing databases that were initialized before PIN feature

ALTER TABLE users ADD COLUMN IF NOT EXISTS pin VARCHAR(6);
