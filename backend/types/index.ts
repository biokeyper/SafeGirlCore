import { Request } from 'express';

/**
 * JWT Payload - decoded from token
 */
export interface JwtPayload {
  userId: string;
  phone: string;
  email: string | null;
  country?: string;
  iat?: number;
  exp?: number;
}

/**
 * Authenticated Request - extends Express Request with user
 */
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Database User row
 */
export interface User {
  id: number;
  userid: string;
  phone: string;
  country?: string;
  email?: string | null;
  phone_verified: boolean;
  email_verified: boolean;
  createdat: Date;
  lastlogin?: Date | null;
  lastphonechange?: Date | null;
  pin?: string | null;
  customppanicmessage?: string | null;
}

/**
 * Database Submission row
 */
export interface Submission {
  id: number;
  reportid: string;
  txhash?: string | null;
  blocknumber?: number | null;
  gasused?: string | null;
  ipfshash?: string | null;
  responses?: string[];
  status: 'pending' | 'submitted' | 'failed';
  confirmations: number;
  type: 'audio' | 'text';
  userid: string;
  metadata?: Record<string, unknown>;
  createdat: Date;
  updatedat: Date;
  submittedat?: Date | null;
  encryptionkey?: string | null;
  encryptionkeyiv?: string | null;
  encryptionkeyauthtag?: string | null;
  encryptiondataiv?: string | null;
  encryptiondataauthtag?: string | null;
  isarchived: boolean;
  archivedat?: Date | null;
  archivedreason?: string | null;
}

/**
 * Database Emergency Contact row
 */
export interface EmergencyContact {
  id: number;
  userid: string;
  phone: string;
  name?: string | null;
  relationship?: string | null;
  isactive: boolean;
  createdat: Date;
}

/**
 * Panic Alert with emergency contacts
 */
export interface PanicAlert {
  id: number;
  userid: string;
  locationdata?: string | null;
  panicmessage?: string | null;
  txhash?: string | null;
  blocknumber?: number | null;
  status: 'pending' | 'confirmed' | 'failed';
  createdat: Date;
  emergencycontacts?: EmergencyContact[];
}

/**
 * Database Notification row
 */
export interface Notification {
  id: number;
  userid: string;
  type: string;
  title: string;
  message: string;
  relatedid?: string | null;
  isread: boolean;
  createdat: Date;
  readat?: Date | null;
}

/**
 * OTP Service result
 */
export interface OtpResult {
  success: boolean;
  otpId?: number;
  expiresAt?: Date;
  expiresIn?: number;
  smsSent?: boolean;
  _testOTP?: string;
  message?: string;
  code?: string;
  attemptsLeft?: number;
}

/**
 * Recovery Token result
 */
export interface RecoveryTokenResult {
  success: boolean;
  token?: string;
  expiresAt?: Date;
  expiresIn?: number;
  message?: string;
  code?: string;
  userId?: string;
  email?: string;
  tokenType?: string;
  newPhone?: string | null;
}

/**
 * Blockchain result
 */
export interface BlockchainResult {
  txHash: string;
  blockNumber?: number;
  gasUsed?: string;
  confirmations?: number;
}

/**
 * IPFS result
 */
export interface IPFSResult {
  ipfsHash: string;
  gatewayUrl: string;
}

/**
 * Database query result
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  command?: string;
}

/**
 * Extend Express Request with user
 */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {};
