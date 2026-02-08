/**
 * Email Service
 *
 * Uses Resend for sending transactional emails including:
 * - Email verification
 * - Password reset
 */

import { Resend } from 'resend';
import { logApiUsage } from "@/lib/admin/metrics";

// Lazy initialization to avoid build-time errors when API key is not set
let resendInstance: Resend | null = null;
let configWarningsLogged = false;

type ResendSendOptions = Parameters<Resend["emails"]["send"]>[0];

function getResend(): Resend {
  if (!resendInstance) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

async function sendResendEmail(payload: ResendSendOptions, emailType: string) {
  const resend = getResend();
  const startTime = Date.now();
  const result = await resend.emails.send(payload);

  await logApiUsage({
    service: "RESEND",
    endpoint: emailType,
    responseTime: Date.now() - startTime,
    statusCode: result.error ? 500 : 200,
    errorMessage: result.error?.message,
  });

  return result;
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
    const result = await sendResendEmail({
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
    }, "EMAIL_VERIFICATION");

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
    const result = await sendResendEmail({
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
    }, "PASSWORD_RESET");

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

/**
 * Send an admin invite email with a link to join the admin dashboard
 */
export async function sendAdminInviteEmail(
  email: string,
  inviteUrl: string,
  role: string,
  inviterName?: string
): Promise<boolean> {
  const config = checkEmailConfiguration();
  if (config.isTestMode) {
    console.log(`[EMAIL] Sending admin invite email (TEST MODE - may fail for non-owner emails)`);
  }

  const roleName = role === 'ADMIN' ? 'Admin' : 'Viewer';
  const inviterDisplay = inviterName || 'The team owner';

  try {
    const result = await sendResendEmail({
      from: FROM_EMAIL,
      to: email,
      subject: `You're invited to the ScamDunk Admin Dashboard`,
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
              <p style="color: #666; margin-top: 5px;">Admin Dashboard Invitation</p>
            </div>

            <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h2 style="margin-top: 0;">You've been invited!</h2>
              <p>${inviterDisplay} has invited you to join the ScamDunk Admin Dashboard as a <strong>${roleName}</strong>.</p>

              ${role === 'ADMIN'
                ? '<p style="color: #666; font-size: 14px;">As an Admin, you\'ll have full access to all dashboard features including scans, lookups, and data analysis.</p>'
                : '<p style="color: #666; font-size: 14px;">As a Viewer, you\'ll have read-only access to all dashboards and data.</p>'
              }

              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" style="background: #4f46e5; color: white; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block; font-size: 16px;">
                  Accept Invitation
                </a>
              </div>

              <p style="color: #666; font-size: 14px;">
                Or copy and paste this link into your browser:<br>
                <a href="${inviteUrl}" style="color: #4f46e5; word-break: break-all;">${inviteUrl}</a>
              </p>
            </div>

            <p style="color: #666; font-size: 14px;">
              This invitation expires in 7 days. You'll be asked to set up your name and password when you accept.
            </p>

            <p style="color: #666; font-size: 14px;">
              If you weren't expecting this invitation, you can safely ignore this email.
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

            <p style="color: #999; font-size: 12px; text-align: center;">
              ScamDunk - Protecting investors from scams
            </p>
          </body>
        </html>
      `,
    }, "ADMIN_INVITE");

    if (result.error) {
      console.error('Resend API error (admin invite):', result.error);
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

    console.log('Admin invite email sent successfully to:', email, 'ID:', result.data?.id);
    return true;
  } catch (error) {
    console.error('Failed to send admin invite email:', error);
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        console.error('[EMAIL ERROR] Invalid or missing RESEND_API_KEY');
      }
    }
    return false;
  }
}

/**
 * Support email configuration
 * support@scamdunk.com receives user tickets
 * avim@scamdunk.com is the admin who manages them
 *
 * Recipients can be managed via admin dashboard at /admin/support
 */
const DEFAULT_SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@scamdunk.com';
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_SUPPORT_EMAIL || 'avim@scamdunk.com';

// Dynamic import to avoid circular dependency
async function getSupportEmailRecipients(category?: string): Promise<string[]> {
  try {
    // Dynamically import prisma to avoid build issues
    const { prisma } = await import('@/lib/db');

    // First get all active recipients
    const allRecipients = await prisma.supportEmailRecipient.findMany({
      where: { isActive: true },
    });

    if (allRecipients.length === 0) {
      console.warn('[EMAIL] No active email recipients configured, using default fallback');
      return [DEFAULT_ADMIN_EMAIL];
    }

    // Filter recipients based on category routing
    const matchedRecipients = allRecipients.filter(r => {
      // Primary recipients always receive all tickets
      if (r.isPrimary) return true;

      // Recipients with null/empty categories receive all tickets
      if (!r.categories) return true;

      // Check if this recipient handles the given category
      if (category) {
        try {
          const recipientCategories: string[] = JSON.parse(r.categories);
          return Array.isArray(recipientCategories) && recipientCategories.includes(category);
        } catch {
          // If JSON parsing fails, try simple string match as fallback
          return r.categories.includes(category);
        }
      }

      return true;
    });

    if (matchedRecipients.length > 0) {
      const emails = matchedRecipients.map(r => r.email);
      console.log(`[EMAIL] Routing to ${emails.length} recipient(s) for category "${category || 'ALL'}":`, emails);
      return emails;
    }

    // If no category-specific match, fall back to primary recipients
    const primaryRecipients = allRecipients.filter(r => r.isPrimary);
    if (primaryRecipients.length > 0) {
      return primaryRecipients.map(r => r.email);
    }
  } catch (error) {
    console.error('Failed to fetch email recipients from database:', error);
  }

  // Fallback to default
  console.warn('[EMAIL] Using default fallback email:', DEFAULT_ADMIN_EMAIL);
  return [DEFAULT_ADMIN_EMAIL];
}

/**
 * Log an email send attempt to the database for tracking
 */
async function logEmailSend(data: {
  recipientEmail: string;
  subject: string;
  emailType: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  resendId?: string;
  errorMessage?: string;
  relatedTicketId?: string;
}): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db');
    await prisma.emailLog.create({
      data: {
        recipientEmail: data.recipientEmail,
        subject: data.subject,
        emailType: data.emailType,
        status: data.status,
        resendId: data.resendId || null,
        errorMessage: data.errorMessage || null,
        relatedTicketId: data.relatedTicketId || null,
        fromEmail: FROM_EMAIL,
      },
    });
  } catch (error) {
    // Don't let logging failures break email sending
    console.error('[EMAIL LOG] Failed to log email send:', error);
  }
}

/**
 * Send a test email to verify configuration is working
 */
export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; message: string; resendId?: string }> {
  const config = checkEmailConfiguration();

  try {
    const result = await sendResendEmail({
      from: FROM_EMAIL,
      to: toEmail,
      subject: 'ScamDunk Email Configuration Test',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #4f46e5; margin: 0;">ScamDunk</h1>
              <p style="color: #666; margin-top: 5px;">Email Configuration Test</p>
            </div>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h2 style="margin-top: 0; color: #166534;">Email is working!</h2>
              <p>This is a test email from your ScamDunk admin dashboard. If you're reading this, your email configuration is correct.</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7; font-weight: bold;">From:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">${FROM_EMAIL}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7; font-weight: bold;">Test Mode:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">${config.isTestMode ? 'Yes (limited delivery)' : 'No (production)'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7; font-weight: bold;">Timestamp:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">${new Date().toISOString()}</td>
                </tr>
              </table>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">ScamDunk Admin - Email Test</p>
          </body>
        </html>
      `,
    }, "TEST");

    if (result.error) {
      await logEmailSend({
        recipientEmail: toEmail,
        subject: 'Email Configuration Test',
        emailType: 'TEST',
        status: 'FAILED',
        errorMessage: result.error.message,
      });
      return { success: false, message: `Resend error: ${result.error.message}` };
    }

    await logEmailSend({
      recipientEmail: toEmail,
      subject: 'Email Configuration Test',
      emailType: 'TEST',
      status: 'SENT',
      resendId: result.data?.id,
    });

    return { success: true, message: 'Test email sent successfully', resendId: result.data?.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logEmailSend({
      recipientEmail: toEmail,
      subject: 'Email Configuration Test',
      emailType: 'TEST',
      status: 'FAILED',
      errorMessage: msg,
    });
    return { success: false, message: msg };
  }
}

/**
 * Send a custom email from the admin dashboard
 */
export async function sendCustomEmail(
  toEmail: string,
  subject: string,
  messageBody: string,
  replyTo?: string
): Promise<{ success: boolean; message: string; resendId?: string }> {
  try {
    const result = await sendResendEmail({
      from: FROM_EMAIL,
      to: toEmail,
      replyTo: replyTo || SUPPORT_EMAIL,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #4f46e5; margin: 0;">ScamDunk</h1>
            </div>
            <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <div style="color: #374151; white-space: pre-wrap;">${messageBody}</div>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              ScamDunk - Protecting investors from scams<br>
              <a href="${APP_URL}" style="color: #0070f3;">scamdunk.com</a>
            </p>
          </body>
        </html>
      `,
    }, "CUSTOM");

    if (result.error) {
      await logEmailSend({
        recipientEmail: toEmail,
        subject,
        emailType: 'CUSTOM',
        status: 'FAILED',
        errorMessage: result.error.message,
      });
      return { success: false, message: `Resend error: ${result.error.message}` };
    }

    await logEmailSend({
      recipientEmail: toEmail,
      subject,
      emailType: 'CUSTOM',
      status: 'SENT',
      resendId: result.data?.id,
    });

    return { success: true, message: 'Email sent successfully', resendId: result.data?.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logEmailSend({
      recipientEmail: toEmail,
      subject,
      emailType: 'CUSTOM',
      status: 'FAILED',
      errorMessage: msg,
    });
    return { success: false, message: msg };
  }
}

// For backwards compatibility
const SUPPORT_EMAIL = DEFAULT_SUPPORT_EMAIL;
const ADMIN_SUPPORT_EMAIL = DEFAULT_ADMIN_EMAIL;

/**
 * Send notification to admin when a new support ticket is submitted
 */
export async function sendSupportTicketNotification(
  ticketId: string,
  name: string,
  email: string,
  subject: string,
  message: string,
  category: string
): Promise<boolean> {
  const config = checkEmailConfiguration();
  if (config.isTestMode) {
    console.log(`[EMAIL] Sending support ticket notification (TEST MODE - may fail for non-owner emails)`);
  }

  const categoryLabels: Record<string, string> = {
    SUPPORT: 'Technical Support',
    FEEDBACK: 'Feedback & Suggestions',
    BUG_REPORT: 'Bug Report',
    FEATURE_REQUEST: 'Feature Request',
    BILLING: 'Billing Question',
    OTHER: 'Other',
  };

  const adminDashboardUrl = `${APP_URL}/admin/support`;
  const timestamp = new Date().toISOString();

  try {
    // Get all active recipients for this category
    const recipients = await getSupportEmailRecipients(category);

    const result = await sendResendEmail({
      from: FROM_EMAIL,
      to: recipients,
      replyTo: email,
      subject: `[Support Ticket] ${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #4f46e5; margin: 0;">ScamDunk Support</h1>
              <p style="color: #666; margin-top: 5px;">New Support Ticket Received</p>
            </div>

            <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h2 style="margin-top: 0; color: #1f2937;">${subject}</h2>

              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; width: 120px;">Ticket ID:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${ticketId}</code></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold;">From:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${name} &lt;${email}&gt;</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Category:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${categoryLabels[category] || category}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Submitted:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${timestamp}</td>
                </tr>
              </table>

              <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin-top: 16px;">
                <p style="margin: 0; color: #374151; white-space: pre-wrap;">${message}</p>
              </div>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${adminDashboardUrl}" style="background: #4f46e5; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">
                View in Admin Dashboard
              </a>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

            <p style="color: #999; font-size: 12px; text-align: center;">
              ScamDunk Support System - Automated Notification
            </p>
          </body>
        </html>
      `,
    }, "TICKET_NOTIFICATION");

    if (result.error) {
      console.error('Resend API error (support ticket notification):', result.error);
      for (const recipient of recipients) {
        await logEmailSend({
          recipientEmail: recipient,
          subject: `[Support Ticket] ${subject}`,
          emailType: 'TICKET_NOTIFICATION',
          status: 'FAILED',
          errorMessage: result.error.message,
          relatedTicketId: ticketId,
        });
      }
      return false;
    }

    console.log('Support ticket notification sent to:', recipients.join(', '), 'ID:', result.data?.id);
    for (const recipient of recipients) {
      await logEmailSend({
        recipientEmail: recipient,
        subject: `[Support Ticket] ${subject}`,
        emailType: 'TICKET_NOTIFICATION',
        status: 'SENT',
        resendId: result.data?.id,
        relatedTicketId: ticketId,
      });
    }
    return true;
  } catch (error) {
    console.error('Failed to send support ticket notification:', error);
    return false;
  }
}

/**
 * Send confirmation email to user after submitting a support ticket
 */
export async function sendSupportTicketConfirmation(
  ticketId: string,
  name: string,
  email: string,
  subject: string,
  category: string
): Promise<boolean> {
  const config = checkEmailConfiguration();
  if (config.isTestMode) {
    console.log(`[EMAIL] Sending support ticket confirmation (TEST MODE - may fail for non-owner emails)`);
  }

  const categoryLabels: Record<string, string> = {
    SUPPORT: 'Technical Support',
    FEEDBACK: 'Feedback & Suggestions',
    BUG_REPORT: 'Bug Report',
    FEATURE_REQUEST: 'Feature Request',
    BILLING: 'Billing Question',
    OTHER: 'Other',
  };

  try {
    const result = await sendResendEmail({
      from: FROM_EMAIL,
      to: email,
      replyTo: SUPPORT_EMAIL,
      subject: `We've received your message: ${subject}`,
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
              <p style="color: #666; margin-top: 5px;">Support Request Received</p>
            </div>

            <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h2 style="margin-top: 0;">Hi ${name},</h2>
              <p>Thank you for reaching out! We've received your ${categoryLabels[category]?.toLowerCase() || 'message'} and our team will review it shortly.</p>

              <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px; font-weight: bold; color: #374151;">Your Ticket Details:</p>
                <p style="margin: 4px 0; color: #666;"><strong>Ticket ID:</strong> <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${ticketId}</code></p>
                <p style="margin: 4px 0; color: #666;"><strong>Subject:</strong> ${subject}</p>
                <p style="margin: 4px 0; color: #666;"><strong>Category:</strong> ${categoryLabels[category] || category}</p>
              </div>

              <p style="color: #666;">We typically respond within 1-2 business days. If your matter is urgent, please mention it in your original message and we'll prioritize accordingly.</p>
            </div>

            <p style="color: #666; font-size: 14px;">
              Need to add more information? Simply reply to this email and it will be added to your ticket.
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

            <p style="color: #999; font-size: 12px; text-align: center;">
              ScamDunk - Protecting investors from scams<br>
              <a href="${APP_URL}" style="color: #0070f3;">scamdunk.com</a>
            </p>
          </body>
        </html>
      `,
    }, "TICKET_CONFIRMATION");

    if (result.error) {
      console.error('Resend API error (support confirmation):', result.error);
      await logEmailSend({
        recipientEmail: email,
        subject: `We've received your message: ${subject}`,
        emailType: 'TICKET_CONFIRMATION',
        status: 'FAILED',
        errorMessage: result.error.message,
        relatedTicketId: ticketId,
      });
      return false;
    }

    console.log('Support ticket confirmation sent to:', email, 'ID:', result.data?.id);
    await logEmailSend({
      recipientEmail: email,
      subject: `We've received your message: ${subject}`,
      emailType: 'TICKET_CONFIRMATION',
      status: 'SENT',
      resendId: result.data?.id,
      relatedTicketId: ticketId,
    });
    return true;
  } catch (error) {
    console.error('Failed to send support ticket confirmation:', error);
    return false;
  }
}

/**
 * Send response to user when admin replies to a ticket
 */
export async function sendSupportTicketResponse(
  ticketId: string,
  userName: string,
  userEmail: string,
  originalSubject: string,
  responseMessage: string,
  responderName: string
): Promise<boolean> {
  const config = checkEmailConfiguration();
  if (config.isTestMode) {
    console.log(`[EMAIL] Sending support ticket response (TEST MODE - may fail for non-owner emails)`);
  }

  try {
    const result = await sendResendEmail({
      from: FROM_EMAIL,
      to: userEmail,
      replyTo: SUPPORT_EMAIL,
      subject: `Re: ${originalSubject}`,
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
              <p style="color: #666; margin-top: 5px;">Support Team Response</p>
            </div>

            <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h2 style="margin-top: 0;">Hi ${userName},</h2>
              <p>We have an update regarding your support request.</p>

              <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 12px; font-size: 13px; color: #666;">
                  <strong>Ticket ID:</strong> <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${ticketId}</code>
                </p>
                <p style="margin: 0; color: #374151; white-space: pre-wrap;">${responseMessage}</p>
              </div>

              <p style="color: #666; font-size: 14px; margin-bottom: 0;">
                <em>— ${responderName}, ScamDunk Support Team</em>
              </p>
            </div>

            <p style="color: #666; font-size: 14px;">
              If you have any further questions, simply reply to this email.
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

            <p style="color: #999; font-size: 12px; text-align: center;">
              ScamDunk - Protecting investors from scams<br>
              <a href="${APP_URL}" style="color: #0070f3;">scamdunk.com</a>
            </p>
          </body>
        </html>
      `,
    }, "TICKET_RESPONSE");

    if (result.error) {
      console.error('Resend API error (support response):', result.error);
      await logEmailSend({
        recipientEmail: userEmail,
        subject: `Re: ${originalSubject}`,
        emailType: 'TICKET_RESPONSE',
        status: 'FAILED',
        errorMessage: result.error.message,
        relatedTicketId: ticketId,
      });
      return false;
    }

    console.log('Support ticket response sent to:', userEmail, 'ID:', result.data?.id);
    await logEmailSend({
      recipientEmail: userEmail,
      subject: `Re: ${originalSubject}`,
      emailType: 'TICKET_RESPONSE',
      status: 'SENT',
      resendId: result.data?.id,
      relatedTicketId: ticketId,
    });
    return true;
  } catch (error) {
    console.error('Failed to send support ticket response:', error);
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
    const result = await sendResendEmail({
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
    }, "API_FAILURE_ALERT");

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
