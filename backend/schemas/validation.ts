/**
 * Input Validation Schemas
 * Using Zod for runtime type checking and validation
 *
 * All schemas include:
 * - Type validation (string, number, etc.)
 * - Format validation (E.164 phone, email, etc.)
 * - Length constraints
 * - Trimming/sanitization
 */

import { z } from "zod";

// ========== COMMON SCHEMAS ==========

/**
 * Phone number in E.164 format
 * Examples: +256750902921, +1234567890
 * Also accepts local format starting with 0 (normalized by backend)
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(7, "Phone number too short")
  .max(20, "Phone number too long")
  .regex(
    /^(\+?[1-9]\d{1,14}|0\d{1,14})$/,
    "Invalid phone number format. Use E.164 format (+COUNTRYCODEXXXXXXX) or local format (0XXXXXXX)"
  );

/**
 * Email address
 * Basic validation - RFC 5322 compliant
 */
export const emailSchema = z
  .string()
  .trim()
  .email("Invalid email address")
  .max(255, "Email too long");

/**
 * OTP code - 6 digits
 */
export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "OTP must be 6 digits");

/**
 * Country code - ISO 3166-1 alpha-2
 * Examples: UG, US, KE, ZA
 */
export const countrySchema = z
  .string()
  .trim()
  .length(2, "Country code must be 2 characters")
  .regex(/^[A-Z]{2}$/, "Country code must be 2 uppercase letters");

/**
 * PIN - 1 to 6 digits (for content lock)
 */
export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{1,6}$/, "PIN must be 1-6 digits");

/**
 * Location data (latitude, longitude, or address)
 * Max 500 characters, trimmed
 */
export const locationSchema = z
  .string()
  .trim()
  .max(500, "Location data too long")
  .optional();

/**
 * Pagination
 */
export const paginationSchema = z.object({
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot exceed 100")
    .default(10),
  offset: z.coerce
    .number()
    .int("Offset must be an integer")
    .min(0, "Offset cannot be negative")
    .default(0),
});

// ========== AUTHENTICATION SCHEMAS ==========

/**
 * Signup Initiate
 * POST /api/auth/signup/initiate
 */
export const signupInitiateSchema = z.object({
  phone: phoneSchema,
  country: countrySchema,
});

/**
 * Signup Verify
 * POST /api/auth/signup/verify
 */
export const signupVerifySchema = z.object({
  phone: phoneSchema,
  otp: otpSchema,
  country: countrySchema,
});

/**
 * Login Initiate
 * POST /api/auth/login/initiate
 */
export const loginInitiateSchema = z.object({
  phone: phoneSchema,
});

/**
 * Login Verify
 * POST /api/auth/login/verify
 */
export const loginVerifySchema = z.object({
  phone: phoneSchema,
  otp: otpSchema,
});

/**
 * Setup Recovery Email
 * POST /api/auth/setup-email
 */
export const setupEmailSchema = z.object({
  email: emailSchema,
});

/**
 * Forgot Phone (Recovery)
 * POST /api/auth/forgot-phone
 */
export const forgotPhoneSchema = z.object({
  email: emailSchema,
});

/**
 * Verify Recovery Token
 * POST /api/auth/verify-recovery
 */
export const verifyRecoverySchema = z.object({
  token: z
    .string()
    .trim()
    .length(64, "Invalid recovery token"),
});

/**
 * Change Phone via Recovery
 * POST /api/auth/change-phone/recovery
 */
export const changePhoneRecoverySchema = z.object({
  token: z
    .string()
    .trim()
    .length(64, "Invalid recovery token"),
  newPhone: phoneSchema,
});

/**
 * Verify Phone Change (Recovery)
 * POST /api/auth/verify-phone-change/recovery
 */
export const verifyPhoneChangeRecoverySchema = z.object({
  token: z
    .string()
    .trim()
    .length(64, "Invalid recovery token"),
  otp: otpSchema,
});

/**
 * Change Phone (Authenticated)
 * POST /api/auth/change-phone
 */
export const changePhoneSchema = z.object({
  newPhone: phoneSchema,
});

/**
 * Verify Phone Change (Authenticated)
 * POST /api/auth/verify-phone-change
 */
export const verifyPhoneChangeSchema = z.object({
  otp: otpSchema,
});

/**
 * Set PIN
 * POST /api/auth/set-pin
 */
export const setPinSchema = z.object({
  pin: pinSchema,
});

/**
 * Delete Account
 * POST /api/auth/delete-account
 */
export const deleteAccountSchema = z.object({
  password: z
    .string()
    .min(1, "Password required for account deletion")
    .optional(),
  confirmDelete: z
    .boolean()
    .refine((val) => val === true, "Must confirm account deletion"),
});

// ========== REPORT SCHEMAS ==========

/**
 * Submit Report
 * POST /api/submitReport
 */
export const submitReportSchema = z.object({
  responses: z
    .array(z.string().trim())
    .min(1, "At least one response required")
    .max(100, "Too many responses"),
  location: locationSchema,
  audioUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * Get Report Status
 * GET /api/reportStatus?reportId=xxx
 */
export const reportStatusSchema = z.object({
  reportId: z
    .string()
    .trim()
    .min(1, "Report ID required")
    .max(255, "Report ID too long"),
});

/**
 * Get Submissions (List Reports)
 * GET /api/submissions?limit=10&offset=0&status=pending
 */
export const submissionsQuerySchema = z.object({
  ...paginationSchema.shape,
  status: z
    .enum(["pending", "submitted", "confirmed", "failed"])
    .optional(),
  type: z.enum(["text", "audio"]).optional(),
});

/**
 * Decrypt Report
 * GET /api/report/:reportId/decrypt
 */
export const decryptReportSchema = z.object({
  reportId: z
    .string()
    .trim()
    .min(1, "Report ID required")
    .max(255, "Report ID too long"),
});

// ========== EMERGENCY SCHEMAS ==========

/**
 * Set Panic Message
 * POST /api/emergency/set-panic-message
 */
export const setPanicMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Panic message required")
    .max(255, "Panic message too long"),
});

/**
 * Add Emergency Contact
 * POST /api/emergency/add-contact
 */
export const addEmergencyContactSchema = z.object({
  phone: phoneSchema,
  name: z
    .string()
    .trim()
    .max(255, "Contact name too long")
    .optional(),
  relationship: z
    .string()
    .trim()
    .max(50, "Relationship too long")
    .optional(),
});

/**
 * Remove Emergency Contact
 * DELETE /api/emergency/remove-contact/:contactId
 */
export const removeContactSchema = z.object({
  contactId: z
    .string()
    .trim()
    .regex(/^\d+$/, "Contact ID must be numeric"),
});

// ========== NOTIFICATION SCHEMAS ==========

/**
 * Mark Notification as Read
 * POST /api/notifications/:notificationId/read
 */
export const markNotificationReadSchema = z.object({
  notificationId: z
    .string()
    .trim()
    .regex(/^\d+$/, "Notification ID must be numeric"),
});

/**
 * Delete Notification
 * DELETE /api/notifications/:notificationId
 */
export const deleteNotificationSchema = z.object({
  notificationId: z
    .string()
    .trim()
    .regex(/^\d+$/, "Notification ID must be numeric"),
});

/**
 * Get Notifications (List)
 * GET /api/notifications?limit=10&offset=0
 */
export const notificationsQuerySchema = z.object({
  ...paginationSchema.shape,
  read: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => (val ? val === "true" : undefined)),
});

// ========== SEARCH SCHEMAS ==========

/**
 * Search Reports
 * GET /api/search?query=xxx&limit=10&offset=0
 */
export const searchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "Search query required")
    .max(255, "Search query too long"),
  ...paginationSchema.shape,
});

// ========== HELPER FUNCTION ==========

/**
 * Validate request data against schema
 * Throws error if validation fails
 * Usage: validateRequest(data, schema)
 */
export function validateRequest<T>(
  data: unknown,
  schema: z.ZodSchema
): T {
  return schema.parse(data) as T;
}

/**
 * Safe validation that returns result object
 * Usage: const result = safeValidate(data, schema)
 *        if (!result.success) { ... }
 */
export function safeValidate<T>(
  data: unknown,
  schema: z.ZodSchema
): { success: boolean; data?: T; error?: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated as T };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const errors = error.issues || [];
      const messages = errors
        .map((err: any) => `${err.path.join(".")}: ${err.message}`)
        .join("; ");
      return { success: false, error: messages };
    }
    return { success: false, error: "Validation failed" };
  }
}
