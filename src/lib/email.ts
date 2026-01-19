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

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const verifyUrl = `${APP_URL}/verify-email?token=${token}`;

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
      return false;
    }

    console.log('Verification email sent successfully to:', email, 'ID:', result.data?.id);
    return true;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

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
      return false;
    }

    console.log('Password reset email sent successfully to:', email, 'ID:', result.data?.id);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}

/**
 * Send an alert email to the admin when an API failure occurs
 */
export async function sendAPIFailureAlert(
  apiName: string,
  ticker: string,
  errorMessage: string,
  assetType: string = 'unknown'
): Promise<boolean> {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;

  if (!adminEmail) {
    console.error('ADMIN_ALERT_EMAIL not configured - cannot send API failure alert');
    return false;
  }

  const timestamp = new Date().toISOString();

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmail,
      subject: `[ALERT] ScamDunk API Failure: ${apiName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #dc2626; margin: 0;">ScamDunk Alert</h1>
              <p style="color: #666; margin-top: 5px;">System Monitoring Notification</p>
            </div>

            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h2 style="margin-top: 0; color: #dc2626;">API Failure Detected</h2>

              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #fecaca; font-weight: bold; width: 120px;">API Service:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #fecaca;">${apiName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #fecaca; font-weight: bold;">Ticker:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #fecaca;">${ticker}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #fecaca; font-weight: bold;">Asset Type:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #fecaca;">${assetType}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #fecaca; font-weight: bold;">Timestamp:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #fecaca;">${timestamp}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; vertical-align: top;">Error:</td>
                  <td style="padding: 8px 0;">
                    <code style="background: #fee2e2; padding: 4px 8px; border-radius: 4px; font-size: 13px; word-break: break-all;">${errorMessage}</code>
                  </td>
                </tr>
              </table>

              <p style="margin-bottom: 0; color: #991b1b;">
                <strong>Action Required:</strong> Please investigate this API failure. Users are currently unable to scan ${assetType} assets until the service is restored.
              </p>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

            <p style="color: #999; font-size: 12px; text-align: center;">
              ScamDunk System Monitoring - Automated Alert
            </p>
          </body>
        </html>
      `,
    });

    if (result.error) {
      console.error('Resend API error (admin alert):', result.error);
      return false;
    }

    console.log('API failure alert sent to admin:', adminEmail, 'ID:', result.data?.id);
    return true;
  } catch (error) {
    console.error('Failed to send API failure alert:', error);
    return false;
  }
}
