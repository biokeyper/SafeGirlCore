/**
 * Typed environment configuration
 * Centralized env var access with validation
 */

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

export const env = {
  // Application
  nodeEnv: getOptionalEnv('NODE_ENV', 'development') || 'development',
  port: parseInt(getOptionalEnv('PORT') || '3001', 10),

  // JWT
  jwtSecret: getEnv('JWT_SECRET'),

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

  // Logging
  logLevel: getOptionalEnv('LOG_LEVEL', 'info'),
};

export default env;
