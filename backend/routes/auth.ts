/**
 * Authentication Routes
 * OTP-based signup, login, and phone recovery
 */

import express, { Request, Response, NextFunction } from 'express';
const router = express.Router();

import authController from '../controllers/authController';
import deleteAccountController from '../controllers/deleteAccountController';
import authMiddleware from '../middleware/auth';
import {
  otpVerifyLimiter,
  otpInitiateLimiter,
  recoveryLimiter,
} from '../middleware/rateLimiter';
import { validate } from '../middleware/validateRequest';
import {
  signupInitiateSchema,
  signupVerifySchema,
  loginInitiateSchema,
  loginVerifySchema,
  setupEmailSchema,
  forgotPhoneSchema,
  verifyRecoverySchema,
  changePhoneRecoverySchema,
  verifyPhoneChangeRecoverySchema,
  changePhoneSchema,
  verifyPhoneChangeSchema,
  setPinSchema,
  deleteAccountSchema,
} from '../schemas/validation';

/**
 * SIGNUP FLOW
 */

/**
 * POST /api/auth/signup/initiate
 * Step 1: User provides phone, receive OTP
 * Rate limit: 10 attempts per hour per IP
 */
router.post(
  '/signup/initiate',
  otpInitiateLimiter,
  validate(signupInitiateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.initiateSignup(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/auth/signup/verify
 * Step 2: User enters OTP, account created, receive JWT
 * Rate limit: 3 attempts per 5 minutes per phone
 */
router.post(
  '/signup/verify',
  otpVerifyLimiter,
  validate(signupVerifySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.verifySignup(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * LOGIN FLOW
 */

/**
 * POST /api/auth/login/initiate
 * Step 1: User provides phone, receive OTP
 * Rate limit: 10 attempts per hour per IP
 */
router.post(
  '/login/initiate',
  otpInitiateLimiter,
  validate(loginInitiateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.initiateLogin(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/auth/login/verify
 * Step 2: User enters OTP, receive JWT
 * Rate limit: 3 attempts per 5 minutes per phone
 */
router.post(
  '/login/verify',
  otpVerifyLimiter,
  validate(loginVerifySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.verifyLogin(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * ACCOUNT RECOVERY FLOW
 */

/**
 * POST /api/auth/forgot-phone
 * Step 1: User provides email, receive recovery token
 * Rate limit: 5 attempts per hour per IP
 */
router.post(
  '/forgot-phone',
  recoveryLimiter,
  validate(forgotPhoneSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.forgotPhone(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/auth/verify-recovery
 * Step 2: User provides recovery token, token verified
 * Rate limit: 5 attempts per hour per IP
 */
router.post(
  '/verify-recovery',
  recoveryLimiter,
  validate(verifyRecoverySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.verifyRecoveryToken(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/auth/change-phone/recovery
 * Step 3: User provides new phone, receive OTP on new phone
 * Rate limit: 5 attempts per hour per IP
 */
router.post(
  '/change-phone/recovery',
  recoveryLimiter,
  validate(changePhoneRecoverySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.changePhoneViaRecovery(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/auth/verify-phone-change/recovery
 * Step 4: User enters OTP from new phone, phone changed, receive new JWT
 * Rate limit: 5 attempts per hour per IP
 */
router.post(
  '/verify-phone-change/recovery',
  recoveryLimiter,
  validate(verifyPhoneChangeRecoverySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.verifyPhoneChangeRecovery(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * AUTHENTICATED USER - PHONE CHANGE
 */

/**
 * POST /api/auth/change-phone
 * Step 1: Authenticated user initiates phone change, receive OTP on new phone
 * Rate limit: 5 attempts per hour per IP (more lenient for authenticated users)
 */
router.post(
  '/change-phone',
  authMiddleware,
  recoveryLimiter,
  validate(changePhoneSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.initiatePhoneChange(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/auth/verify-phone-change
 * Step 2: Authenticated user enters OTP, phone changed, receive new JWT
 * Rate limit: 5 attempts per hour per IP (more lenient for authenticated users)
 */
router.post(
  '/verify-phone-change',
  authMiddleware,
  recoveryLimiter,
  validate(verifyPhoneChangeSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.verifyPhoneChange(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * UTILITY
 */

/**
 * GET /api/auth/verify
 * Verify JWT token is still valid
 */
router.get('/verify', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.verifyToken(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/setup-email
 * Authenticated user sets recovery email after signup/login
 * Protected endpoint - requires valid JWT token
 */
router.post(
  '/setup-email',
  authMiddleware,
  validate(setupEmailSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.setupRecoveryEmail(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/auth/verify-email
 * Verify email address via deep link (public, no auth required)
 * Query params: email, userId
 */
router.get('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.verifyEmailAddress(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * PIN MANAGEMENT
 */

/**
 * POST /api/auth/set-pin
 * Authenticated user sets or updates their content lock PIN
 * Protected endpoint - requires valid JWT token
 */
router.post(
  '/set-pin',
  authMiddleware,
  validate(setPinSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authController.setPin(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/auth/get-pin
 * Authenticated user retrieves their current PIN
 * Protected endpoint - requires valid JWT token
 */
router.get('/get-pin', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.getPin(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE ACCOUNT
 */

/**
 * POST /api/auth/delete-account
 * Authenticated user permanently deletes their account and all data
 * Protected endpoint - requires valid JWT token
 */
router.post(
  '/delete-account',
  authMiddleware,
  validate(deleteAccountSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteAccountController.deleteAccount(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * LOGOUT
 */

/**
 * POST /api/auth/logout
 * Authenticated user logs out
 * Protected endpoint - requires valid JWT token
 */
router.post('/logout', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authController.logout(req, res, next);
  } catch (error) {
    next(error);
  }
});

export default router;
