/**
 * Logger Utility
 * Centralized logging for backend
 * Tracks all important actions with timestamps
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.logFile = path.join(this.logDir, `safegirl-${new Date().toISOString().split('T')[0]}.log`);
    this.logLevel = process.env.LOG_LEVEL || 'info';

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Get current timestamp in readable format
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Format log message
   */
  formatMessage(level, category, message, data = null) {
    let log = `[${this.getTimestamp()}] [${level.toUpperCase()}] [${category}] ${message}`;
    if (data) {
      log += ` | DATA: ${JSON.stringify(data)}`;
    }
    return log;
  }

  /**
   * Write to both console and file
   */
  writeLog(level, category, message, data = null) {
    const formatted = this.formatMessage(level, category, message, data);

    // Console output with colors
    const colors = {
      info: '\x1b[36m',      // Cyan
      success: '\x1b[32m',   // Green
      warn: '\x1b[33m',      // Yellow
      error: '\x1b[31m',     // Red
      debug: '\x1b[35m',     // Magenta
      reset: '\x1b[0m'
    };

    const color = colors[level] || colors.reset;
    console.log(`${color}${formatted}${colors.reset}`);

    // File output
    fs.appendFileSync(this.logFile, formatted + '\n', 'utf8');
  }

  // ========== PUBLIC LOGGING METHODS ==========

  /**
   * Info: General information about what's happening
   * Usage: logger.info('IPFS', 'Starting upload', { size: 1024 })
   */
  info(category, message, data = null) {
    this.writeLog('info', category, message, data);
  }

  /**
   * Success: When an operation completes successfully
   * Usage: logger.success('BLOCKCHAIN', 'Transaction confirmed', { txHash: '0x...' })
   */
  success(category, message, data = null) {
    this.writeLog('success', category, message, data);
  }

  /**
   * Warn: Something unexpected but recoverable
   * Usage: logger.warn('IPFS', 'Retry attempt', { attempt: 2, maxRetries: 3 })
   */
  warn(category, message, data = null) {
    this.writeLog('warn', category, message, data);
  }

  /**
   * Error: Something broke
   * Usage: logger.error('BLOCKCHAIN', 'Transaction failed', { error: 'Gas limit exceeded' })
   */
  error(category, message, data = null) {
    this.writeLog('error', category, message, data);
  }

  /**
   * Debug: Detailed info for troubleshooting
   * Usage: logger.debug('VALIDATION', 'Checking payload', { payloadSize: 5000 })
   */
  debug(category, message, data = null) {
    if (this.logLevel === 'debug') {
      this.writeLog('debug', category, message, data);
    }
  }

  // ========== CONVENIENCE METHODS ==========

  /**
   * Log incoming API request
   */
  logRequest(method, endpoint, data = null) {
    this.info('API', `${method} ${endpoint}`, data);
  }

  /**
   * Log API response
   */
  logResponse(endpoint, statusCode, message = null) {
    this.success('API', `${endpoint} → ${statusCode}`, { message });
  }

  /**
   * Log IPFS operation
   */
  logIPFS(operation, status, data = null) {
    if (status === 'success') {
      this.success('IPFS', `${operation} completed`, data);
    } else {
      this.error('IPFS', `${operation} failed`, data);
    }
  }

  /**
   * Log blockchain operation
   */
  logBlockchain(operation, status, data = null) {
    if (status === 'success') {
      this.success('BLOCKCHAIN', `${operation} succeeded`, data);
    } else if (status === 'pending') {
      this.info('BLOCKCHAIN', `${operation} pending`, data);
    } else {
      this.error('BLOCKCHAIN', `${operation} failed`, data);
    }
  }

  /**
   * Log server events
   */
  logServer(message, data = null) {
    this.info('SERVER', message, data);
  }

  /**
   * Log validation errors
   */
  logValidation(field, error) {
    this.warn('VALIDATION', `Invalid: ${field}`, { error });
  }
}

// Export singleton instance
module.exports = new Logger();
