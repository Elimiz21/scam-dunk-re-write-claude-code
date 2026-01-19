/**
 * Email Service
 *
 * Uses Resend for sending transactional emails including:
 * - Email verification
 * - Password reset
 */

import { Resend } from 'resend';

// Lazy initialization to avoid build-time errors when API key is not set
let resendInstance: Resend | null = null;
let configWarningsLogged = false;

function getResend(): Resend {
  if (!resendInstance) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

// Use Resend's test email if no verified domain is configured
// To use your own domain, verify it at https://resend.com/domains and set EMAIL_FROM
const FROM_EMAIL = process.env.EMAIL_FROM || 'ScamDunk <onboarding@resend.dev>';
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

/**
 * Check email configuration and log warnings if issues are detected
 */
function checkEmailConfiguration(): { isTestMode: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const isTestMode = FROM_EMAIL.includes('@resend.dev');

  if (!configWarningsLogged) {
    // Check for test domain usage
    if (isTestMode) {
      const warning = '[EMAIL CONFIG WARNING] Using Resend test domain (onboarding@resend.dev). ' +
        'Emails can ONLY be sent to the Resend account owner\'s email address. ' +
        'To send emails to all users, verify a custom domain at https://resend.com/domains ' +
        'and set EMAIL_FROM environment variable.';
      console.warn(warning);
      warnings.push(warning);
    }

    // Check for localhost URL
    if (APP_URL.includes('localhost')) {
      const warning = '[EMAIL CONFIG WARNING] NEXTAUTH_URL is set to localhost. ' +
        'Verification links in emails will point to localhost and won\'t work for remote users. ' +
        'Set NEXTAUTH_URL to your production domain.';
      console.warn(warning);
      warnings.push(warning);
    }

    // Check for missing protocol
    if (!APP_URL.startsWith('http://') && !APP_URL.startsWith('https://')) {
      const warning = '[EMAIL CONFIG WARNING] NEXTAUTH_URL is missing protocol (http:// or https://). ' +
        'This may cause verification links to be malformed.';
      console.warn(warning);
      warnings.push(warning);
    }

    configWarningsLogged = true;
  }

  return { isTestMode, warnings };
}

/**
 * Validate email configuration (exported for health checks)
 */
export function validateEmailConfig(): {
  isValid: boolean;
  isTestMode: boolean;
  fromEmail: string;
  appUrl: string;
  warnings: string[];
  errors: string[];
} {
  const errors: string[] = [];
  const { isTestMode, warnings } = checkEmailConfiguration();

  if (!process.env.RESEND_API_KEY) {
    errors.push('RESEND_API_KEY is not set');
  }

  return {
    isValid: errors.length === 0,
    isTestMode,
    fromEmail: FROM_EMAIL,
    appUrl: APP_URL,
    warnings,
    errors,
  };
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const verifyUrl = `${APP_URL}/verify-email?token=${token}`;

  // Check configuration
  const config = checkEmailConfiguration();
  if (config.isTestMode) {
    console.log(`[EMAIL] Sending verification email (TEST MODE - may fail for non-owner emails)`);
  }

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Verify your ScamDunk account',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #0070f3; margin: 0;">ScamDunk</h1>
              <p style="color: #666; margin-top: 5px;">Protect yourself from investment scams</p>
            </div>

            <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h2 style="margin-top: 0;">Verify your email address</h2>
              <p>Thanks for signing up for ScamDunk! Please verify your email address by clicking the button below:</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${verifyUrl}" style="background: #0070f3; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">
                  Verify Email Address
                </a>
              </div>

              <p style="color: #666; font-size: 14px;">
                Or copy and paste this link into your browser:<br>
                <a href="${verifyUrl}" style="color: #0070f3; word-break: break-all;">${verifyUrl}</a>
              </p>
            </div>

            <p style="color: #666; font-size: 14px;">
              This link will expire in 24 hours. If you didn't create an account with ScamDunk, you can safely ignore this email.
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

            <p style="color: #999; font-size: 12px; text-align: center;">
              ScamDunk - Protecting investors from scams
            </p>
          </body>
        </html>
      `,
    });

    if (result.error) {
      console.error('Resend API error (verification):', result.error);
      // Check for common Resend errors
      const errorMessage = result.error.message?.toLowerCase() || '';
      if (errorMessage.includes('can only send') || errorMessage.includes('not verified')) {
        console.error(
          '[EMAIL ERROR] Resend domain not verified. When using onboarding@resend.dev, ' +
          'emails can only be sent to the Resend account owner. ' +
          'Verify a custom domain at https://resend.com/domains'
        );
      }
      return false;
    }

    console.log('Verification email sent successfully to:', email, 'ID:', result.data?.id);
    return true;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    // Log additional context for common issues
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        console.error('[EMAIL ERROR] Invalid or missing RESEND_API_KEY');
      }
    }
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  // Check configuration
  const config = checkEmailConfiguration();
  if (config.isTestMode) {
    console.log(`[EMAIL] Sending password reset email (TEST MODE - may fail for non-owner emails)`);
  }

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Reset your ScamDunk password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #0070f3; margin: 0;">ScamDunk</h1>
              <p style="color: #666; margin-top: 5px;">Protect yourself from investment scams</p>
            </div>

            <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h2 style="margin-top: 0;">Reset your password</h2>
              <p>We received a request to reset the password for your ScamDunk account. Click the button below to choose a new password:</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background: #0070f3; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">
                  Reset Password
                </a>
              </div>

              <p style="color: #666; font-size: 14px;">
                Or copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color: #0070f3; word-break: break-all;">${resetUrl}</a>
              </p>
            </div>

            <p style="color: #666; font-size: 14px;">
              This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email - your password will remain unchanged.
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

            <p style="color: #999; font-size: 12px; text-align: center;">
              ScamDunk - Protecting investors from scams
            </p>
          </body>
        </html>
      `,
    });

    if (result.error) {
      console.error('Resend API error (password reset):', result.error);
      // Check for common Resend errors
      const errorMessage = result.error.message?.toLowerCase() || '';
      if (errorMessage.includes('can only send') || errorMessage.includes('not verified')) {
        console.error(
          '[EMAIL ERROR] Resend domain not verified. When using onboarding@resend.dev, ' +
          'emails can only be sent to the Resend account owner. ' +
          'Verify a custom domain at https://resend.com/domains'
        );
      }
      return false;
    }

    console.log('Password reset email sent successfully to:', email, 'ID:', result.data?.id);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    // Log additional context for common issues
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        console.error('[EMAIL ERROR] Invalid or missing RESEND_API_KEY');
      }
    }
    return false;
  }
}
