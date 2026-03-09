/**
 * Email Service
 * Handles sending emails using nodemailer and SMS using Twilio
 */

const nodemailer = require('nodemailer');
const twilio = require('twilio');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.senderEmail = process.env.EMAIL_FROM;
    this.initialized = false;
    this.twilioClient = null;
    this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  }

  /**
   * Initialize email transporter and Twilio SMS client
   */
  async initialize() {
    try {
      // Initialize Email service
      if (!process.env.EMAIL_FROM || !process.env.EMAIL_PASSWORD) {
        logger.warn('EMAIL', 'Email credentials not configured - email service disabled');
      } else {
        // Create transporter for Gmail (adjust for other providers)
        this.transporter = nodemailer.createTransport({
          service: 'gmail',  // Change this if using different email provider
          auth: {
            user: process.env.EMAIL_FROM,
            pass: process.env.EMAIL_PASSWORD  // Use app password for Gmail
          }
        });

        // Test connection
        await this.transporter.verify();
        logger.success('EMAIL', 'Email service initialized', {
          email: process.env.EMAIL_FROM
        });
      }

      // Initialize Twilio SMS service
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
        logger.warn('SMS', 'Twilio credentials not configured - SMS service disabled');
      } else {
        this.twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        logger.success('SMS', 'Twilio SMS service initialized', {
          phoneNumber: this.twilioPhoneNumber
        });
      }

      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('EMAIL', 'Failed to initialize services', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Send recovery link email
   */
  async sendRecoveryEmail(recipientEmail, recoveryLink) {
    try {
      if (!this.initialized) {
        logger.warn('EMAIL', 'Email service not initialized, skipping send');
        return false;
      }

      const subject = 'SafeGirl - Account Recovery';
      const htmlContent = `
        <h2>SafeGirl Account Recovery</h2>
        <p>We received a request to recover your SafeGirl account.</p>

        <p><strong>Your recovery link:</strong></p>
        <p><a href="${recoveryLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Click here to recover your account
        </a></p>

        <p>Or copy and paste this link in your browser:</p>
        <p>${recoveryLink}</p>

        <p><strong>⏱️ This link expires in 24 hours.</strong></p>

        <hr>
        <p><small>If you didn't request this, please ignore this email.</small></p>
        <p><small>SafeGirl - Women Safety Platform</small></p>
      `;

      const plainText = `
SafeGirl Account Recovery

We received a request to recover your SafeGirl account.

Your recovery link: ${recoveryLink}

This link expires in 24 hours.

If you didn't request this, please ignore this email.
      `;

      const mailOptions = {
        from: this.senderEmail,
        to: recipientEmail,
        subject,
        html: htmlContent,
        text: plainText
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.success('EMAIL', 'Recovery email sent', {
        to: recipientEmail,
        messageId: info.messageId
      });

      return true;
    } catch (error) {
      logger.error('EMAIL', 'Failed to send recovery email', {
        error: error.message,
        to: recipientEmail
      });
      return false;
    }
  }

  /**
   * Send OTP via email (alternative delivery method)
   */
  async sendOTPEmail(recipientEmail, otpCode) {
    try {
      if (!this.initialized) {
        logger.warn('EMAIL', 'Email service not initialized, skipping OTP send');
        return false;
      }

      const subject = 'SafeGirl - Your verification code';
      const htmlContent = `
        <h2>SafeGirl Verification Code</h2>
        <p>Your verification code is:</p>

        <div style="background-color: #f0f0f0; padding: 20px; text-align: center; border-radius: 5px;">
          <h1 style="letter-spacing: 5px; font-family: monospace; color: #007bff;">
            ${otpCode}
          </h1>
        </div>

        <p><strong>⏱️ This code expires in 5 minutes.</strong></p>
        <p>Do not share this code with anyone.</p>

        <hr>
        <p><small>SafeGirl - Women Safety Platform</small></p>
      `;

      const plainText = `
SafeGirl Verification Code

Your verification code is: ${otpCode}

This code expires in 5 minutes.
Do not share this code with anyone.
      `;

      const mailOptions = {
        from: this.senderEmail,
        to: recipientEmail,
        subject,
        html: htmlContent,
        text: plainText
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.success('EMAIL', 'OTP email sent', {
        to: recipientEmail,
        messageId: info.messageId
      });

      return true;
    } catch (error) {
      logger.error('EMAIL', 'Failed to send OTP email', {
        error: error.message,
        to: recipientEmail
      });
      return false;
    }
  }

  /**
   * Send welcome email to new users
   */
  async sendWelcomeEmail(recipientEmail, userId) {
    try {
      if (!this.initialized) {
        logger.warn('EMAIL', 'Email service not initialized, skipping welcome send');
        return false;
      }

      const subject = 'Welcome to SafeGirl!';
      const htmlContent = `
        <h2>Welcome to SafeGirl! 👋</h2>
        <p>Thank you for creating your SafeGirl account.</p>

        <p>You now have access to:</p>
        <ul>
          <li>📱 Secure report submission</li>
          <li>🔒 End-to-end encrypted storage</li>
          <li>⛓️ Blockchain verification</li>
          <li>🚨 Emergency panic button</li>
          <li>👥 Safe access control for trusted contacts</li>
        </ul>

        <p>Your privacy and safety are our top priority.</p>

        <hr>
        <p><small>SafeGirl - Women Safety Platform</small></p>
      `;

      const plainText = `
Welcome to SafeGirl!

Thank you for creating your SafeGirl account.

You now have access to:
- Secure report submission
- End-to-end encrypted storage
- Blockchain verification
- Emergency panic button
- Safe access control for trusted contacts

Your privacy and safety are our top priority.
      `;

      const mailOptions = {
        from: this.senderEmail,
        to: recipientEmail,
        subject,
        html: htmlContent,
        text: plainText
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.success('EMAIL', 'Welcome email sent', {
        to: recipientEmail,
        userId,
        messageId: info.messageId
      });

      return true;
    } catch (error) {
      logger.error('EMAIL', 'Failed to send welcome email', {
        error: error.message,
        to: recipientEmail
      });
      return false;
    }
  }

  /**
   * Send email verification link for recovery email
   */
  async sendEmailVerification(recipientEmail, userId) {
    try {
      if (!this.initialized) {
        logger.warn('EMAIL', 'Email service not initialized, skipping verification send');
        return false;
      }

      const subject = 'SafeGirl - Verify Your Email Address';
      // Deep link format for mobile app: APP_SCHEME://verify-email/email/userId
      const appScheme = process.env.APP_SCHEME || 'safegirl';
      const verificationLink = `${appScheme}://verify-email/${encodeURIComponent(recipientEmail)}/${userId}`;

      const htmlContent = `
        <h2>Verify Your Email Address</h2>
        <p>Thank you for adding an email address to your SafeGirl account!</p>

        <p>Click the button below to verify your email address (opens SafeGirl app):</p>
        <p>
          <a href="${verificationLink}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email Address
          </a>
        </p>

        <p>Or copy and paste this link:</p>
        <p>${verificationLink}</p>

        <p><strong>⏱️ This link expires in 24 hours.</strong></p>

        <p>Once verified, this email can be used to recover your SafeGirl account if needed.</p>

        <hr>
        <p><small>If you didn't add this email address, please ignore this email.</small></p>
        <p><small>SafeGirl - Women Safety Platform</small></p>
      `;

      const plainText = `
Verify Your Email Address

Thank you for adding an email address to your SafeGirl account!

Click the link below to verify your email address:
${verificationLink}

This link expires in 24 hours.

If you didn't add this email address, please ignore this email.
SafeGirl - Women Safety Platform
      `;

      const mailOptions = {
        from: this.senderEmail,
        to: recipientEmail,
        subject,
        html: htmlContent,
        text: plainText
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.success('EMAIL', 'Email verification sent', {
        to: recipientEmail,
        userId,
        messageId: info.messageId
      });

      return true;
    } catch (error) {
      logger.error('EMAIL', 'Failed to send email verification', {
        error: error.message,
        to: recipientEmail
      });
      return false;
    }
  }

  /**
   * Send SMS via Twilio
   * Used for emergency panic alerts to emergency contacts
   */
  async sendSMS(toPhoneNumber, messageBody) {
    try {
      if (!this.twilioClient) {
        logger.warn('SMS', 'Twilio service not initialized, skipping SMS send');
        return false;
      }

      if (!toPhoneNumber || !messageBody) {
        logger.warn('SMS', 'Missing phone number or message body');
        return false;
      }

      const message = await this.twilioClient.messages.create({
        body: messageBody,
        from: this.twilioPhoneNumber,
        to: toPhoneNumber
      });

      logger.success('SMS', 'SMS sent successfully', {
        to: toPhoneNumber,
        messageId: message.sid,
        status: message.status
      });

      return true;
    } catch (error) {
      logger.error('SMS', 'Failed to send SMS', {
        error: error.message,
        to: toPhoneNumber
      });
      return false;
    }
  }
}

module.exports = new EmailService();
