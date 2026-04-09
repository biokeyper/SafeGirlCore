/**
 * Database Encryption at Rest Service
 * Handles encryption/decryption of sensitive data using pgcrypto
 */

import logger from "../utils/logger";

const ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || process.env.ENCRYPTION_MASTER_KEY;

if (!ENCRYPTION_KEY) {
  logger.warn("DB_ENCRYPTION", "DB_ENCRYPTION_KEY not set, encryption at rest disabled");
}

/**
 * Escape single quotes in strings for SQL
 */
function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Generate SQL to encrypt a value
 * Usage in queries: pgp_sym_encrypt('value', 'key')
 */
export function encryptValue(value: string): {
  sql: string;
  values: string[];
} {
  if (!ENCRYPTION_KEY) {
    return {
      sql: "$1",
      values: [value],
    };
  }

  return {
    sql: "pgp_sym_encrypt($1, $2)",
    values: [value, ENCRYPTION_KEY],
  };
}

/**
 * Generate SQL to decrypt a value
 * Usage in queries: pgp_sym_decrypt(encrypted_column, 'key')
 */
export function decryptValue(columnName: string): string {
  if (!ENCRYPTION_KEY) {
    return columnName;
  }

  return `pgp_sym_decrypt(${columnName}, $1)`;
}

/**
 * Encrypt phone number for storage
 */
export function encryptPhone(phone: string): { sql: string; values: string[] } {
  return encryptValue(phone);
}

/**
 * Decrypt phone number from database
 */
export function decryptPhone(columnName: string): string {
  return decryptValue(columnName);
}

/**
 * Encrypt emergency contact phone
 */
export function encryptContactPhone(phone: string): { sql: string; values: string[] } {
  return encryptValue(phone);
}

/**
 * Get encryption key for queries
 */
export function getEncryptionKey(): string | null {
  return ENCRYPTION_KEY || null;
}

/**
 * Check if encryption is enabled
 */
export function isEncryptionEnabled(): boolean {
  return !!ENCRYPTION_KEY;
}

logger.info(
  "DB_ENCRYPTION",
  `Database encryption at rest ${isEncryptionEnabled() ? "ENABLED" : "DISABLED"}`
);
