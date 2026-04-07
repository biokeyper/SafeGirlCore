/**
 * Retry utility with exponential backoff
 * Retries transient errors (network, timeout, nonce) up to max attempts
 */

import logger from './logger';

interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  operationName?: string;
}

/**
 * Check if error is transient (retryable)
 * Permanent errors (invalid input, auth) should fail immediately
 */
function isTransientError(error: any): boolean {
  const message = error.message?.toLowerCase() || '';
  const code = error.code || '';

  // Transient errors that should be retried
  const transientPatterns = [
    'network',
    'timeout',
    'econnrefused',
    'econnreset',
    'etimedout',
    'nonce',
    'gas',
    'pending',
    'temporarily',
    'temporarily unavailable',
  ];

  // Permanent errors that should NOT be retried
  const permanentPatterns = [
    'invalid',
    'reverted',
    'unauthorized',
    'forbidden',
    'not found',
    'already exists',
  ];

  // Check permanent first (fail fast)
  for (const pattern of permanentPatterns) {
    if (message.includes(pattern)) return false;
  }

  // Check transient
  for (const pattern of transientPatterns) {
    if (message.includes(pattern) || code.includes(pattern)) return true;
  }

  // Default: retry network-like errors
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EHOSTUNREACH'
  );
}

/**
 * Retry function with exponential backoff
 * @param operation Async function to retry
 * @param options Retry configuration
 * @returns Result of operation
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 16000,
    backoffMultiplier = 2,
    operationName = 'Operation',
  } = options;

  let lastError: Error | null = null;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.debug('RETRY', `${operationName} - Attempt ${attempt}/${maxAttempts}`);
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Check if error is transient (retryable)
      if (!isTransientError(error) || attempt === maxAttempts) {
        logger.error('RETRY', `${operationName} failed permanently`, {
          attempt,
          error: lastError.message,
          code: (error as any).code,
        });
        throw error;
      }

      // Log retry attempt
      logger.warn('RETRY', `${operationName} failed, retrying in ${delayMs}ms`, {
        attempt,
        error: lastError.message,
        nextDelay: delayMs,
      });

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Increase delay for next attempt (capped at maxDelayMs)
      delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
    }
  }

  // Should never reach here, but throw just in case
  throw lastError || new Error(`${operationName} failed after ${maxAttempts} attempts`);
}

export default retryWithBackoff;
