/**
 * Typed environment configuration
 * Centralized env var access with validation
 *
 * Critical variables (must be set):
 * - JWT_SECRET: Authentication tokens
 * - DATABASE_URL: Database connection
 *
 * Production variables (must be set in production):
 * - PRIVATE_KEY: Blockchain wallet private key
 * - DEPLOYED_CONTRACT_ADDRESS: Smart contract address
 * - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER: SMS service
 * - EMAIL_FROM, EMAIL_PASSWORD: Email service (or use defaults)
 * - ENCRYPTION_MASTER_KEY: Data encryption key
 */

function getEnv(key: string, context?: string): string {
  const value = process.env[key];
  if (!value) {
    const hint = context ? ` (${context})` : '';
    throw new Error(`Missing required environment variable: ${key}${hint}`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

/**
 * Validate critical environment variables
 * Call this early in server startup
 */
export function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors: string[] = [];

  // Always required
  try {
    getEnv('JWT_SECRET', 'used for signing authentication tokens');
  } catch (e) {
    errors.push(`${e}`);
  }

  try {
    getEnv('DATABASE_URL', 'PostgreSQL connection string');
  } catch (e) {
    errors.push(`${e}`);
  }

  // Production required
  if (isProduction) {
    const productionVars = [
      ['PRIVATE_KEY', 'blockchain wallet private key (32 hex chars)'],
      ['DEPLOYED_CONTRACT_ADDRESS', 'smart contract address on blockchain'],
      ['TWILIO_ACCOUNT_SID', 'Twilio SMS service account ID'],
      ['TWILIO_AUTH_TOKEN', 'Twilio SMS service auth token'],
      ['TWILIO_PHONE_NUMBER', 'Twilio SMS phone number (e.g., +1234567890)'],
      ['ENCRYPTION_MASTER_KEY', 'master key for encrypting user data'],
    ];

    for (const [key, description] of productionVars) {
      if (!process.env[key]) {
        errors.push(
          `Missing production variable: ${key} (${description}). Set in GitHub Secrets and inject via Render.`
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach((err) => console.error(`   - ${err}`));
    console.error('\n📖 See GITHUB_SECRETS_SETUP.md for configuration instructions.');
    process.exit(1);
  }

  console.log('✅ Environment variables validated');
}

export const env = {
  // Application
  nodeEnv: getOptionalEnv('NODE_ENV', 'development') || 'development',
  port: parseInt(getOptionalEnv('PORT') || '3001', 10),

  // JWT
  jwtSecret: getEnv('JWT_SECRET'),
  jwtSecretPrevious: getOptionalEnv('JWT_SECRET_PREVIOUS'), // For secret rotation

  // Database
  databaseUrl: getEnv('DATABASE_URL'),

  // Blockchain
  polygonAmoyRpcUrl: getOptionalEnv('POLYGON_AMOY_RPC_URL', 'https://rpc-amoy.polygon.technology/'),
  deployedContractAddress: getOptionalEnv('DEPLOYED_CONTRACT_ADDRESS'),
  privateKey: getOptionalEnv('PRIVATE_KEY'),
  countryCode: getOptionalEnv('COUNTRY_CODE', '256'),

  // Twilio
  twilioAccountSid: getOptionalEnv('TWILIO_ACCOUNT_SID'),
  twilioAuthToken: getOptionalEnv('TWILIO_AUTH_TOKEN'),
  twilioPhoneNumber: getOptionalEnv('TWILIO_PHONE_NUMBER'),

  // Pinata (IPFS)
  pinataJwt: getOptionalEnv('PINATA_JWT'),
  pinataGateway: getOptionalEnv('PINATA_GATEWAY_URL'),

  // Web3.Storage (IPFS backup)
  web3StorageToken: getOptionalEnv('WEB3_STORAGE_TOKEN'),

  // Email
  gmailUser: getOptionalEnv('GMAIL_USER'),
  gmailPassword: getOptionalEnv('GMAIL_PASSWORD'),
  frontendUrl: getOptionalEnv('FRONTEND_URL', 'http://localhost:3000'),

  // Encryption (with rotation support)
  encryptionMasterKey: getEnv('ENCRYPTION_MASTER_KEY'),
  encryptionMasterKeyPrevious: getOptionalEnv('ENCRYPTION_MASTER_KEY_PREVIOUS') || undefined, // For key rotation
  encryptionKeyVersion: parseInt(getOptionalEnv('ENCRYPTION_KEY_VERSION', '1') || '1', 10),

  // Logging
  logLevel: getOptionalEnv('LOG_LEVEL', 'info'),
};

export default env;
