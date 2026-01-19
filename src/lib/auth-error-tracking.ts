/**
 * Authentication Error Tracking
 *
 * Provides utilities for logging and tracking authentication-related errors
 * to help monitor system health and identify issues with login/signup flows.
 */

import { prisma } from './db';

export type AuthErrorType =
  | 'SIGNUP_FAILED'
  | 'LOGIN_FAILED'
  | 'VERIFICATION_FAILED'
  | 'PASSWORD_RESET_FAILED'
  | 'EMAIL_SEND_FAILED';

export type AuthErrorCode =
  // Signup errors
  | 'EMAIL_ALREADY_EXISTS'
  | 'INVALID_EMAIL'
  | 'WEAK_PASSWORD'
  | 'CAPTCHA_FAILED'
  | 'RATE_LIMITED'
  // Login errors
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_DISABLED'
  | 'USER_NOT_FOUND'
  // Verification errors
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_ALREADY_USED'
  // Email errors
  | 'RESEND_API_ERROR'
  | 'INVALID_FROM_ADDRESS'
  | 'RECIPIENT_REJECTED'
  // General errors
  | 'DATABASE_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface AuthErrorContext {
  email?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  endpoint: string;
}

export interface AuthErrorDetails {
  errorType: AuthErrorType;
  errorCode: AuthErrorCode;
  message: string;
  details?: Record<string, unknown>;
  error?: Error;
}

/**
 * Log an authentication error to the database
 */
export async function logAuthError(
  context: AuthErrorContext,
  errorDetails: AuthErrorDetails
): Promise<void> {
  try {
    // Create the error log entry
    await prisma.authErrorLog.create({
      data: {
        errorType: errorDetails.errorType,
        errorCode: errorDetails.errorCode,
        email: context.email ? maskEmail(context.email) : null,
        userId: context.userId,
        endpoint: context.endpoint,
        message: errorDetails.message,
        details: errorDetails.details ? JSON.stringify(errorDetails.details) : null,
        stackTrace: errorDetails.error?.stack || null,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    // Update daily summary
    await updateDailySummary(errorDetails.errorType);

    // Check if we should trigger alerts
    await checkErrorThresholds(errorDetails.errorType);
  } catch (loggingError) {
    // Don't let logging errors break the main flow
    console.error('Failed to log auth error:', loggingError);
    console.error('Original error:', errorDetails);
  }
}

/**
 * Mask email for privacy (e.g., "t***@example.com")
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal = local.charAt(0) + '***';
  return `${maskedLocal}@${domain}`;
}

/**
 * Update the daily error summary
 */
async function updateDailySummary(errorType: AuthErrorType): Promise<void> {
  const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const fieldMap: Record<AuthErrorType, string> = {
    SIGNUP_FAILED: 'signupErrors',
    LOGIN_FAILED: 'loginErrors',
    VERIFICATION_FAILED: 'verificationErrors',
    PASSWORD_RESET_FAILED: 'passwordResetErrors',
    EMAIL_SEND_FAILED: 'emailSendErrors',
  };

  const field = fieldMap[errorType];

  await prisma.authErrorSummary.upsert({
    where: { dateKey },
    update: {
      [field]: { increment: 1 },
    },
    create: {
      dateKey,
      [field]: 1,
    },
  });
}

/**
 * Check if error thresholds have been exceeded and log warnings
 */
async function checkErrorThresholds(errorType: AuthErrorType): Promise<void> {
  const dateKey = new Date().toISOString().split('T')[0];

  // Define thresholds for alerting
  const ALERT_THRESHOLDS: Record<AuthErrorType, number> = {
    SIGNUP_FAILED: 50,
    LOGIN_FAILED: 100,
    VERIFICATION_FAILED: 30,
    PASSWORD_RESET_FAILED: 20,
    EMAIL_SEND_FAILED: 10, // Email failures are critical
  };

  const summary = await prisma.authErrorSummary.findUnique({
    where: { dateKey },
  });

  if (!summary) return;

  const fieldMap: Record<AuthErrorType, keyof typeof summary> = {
    SIGNUP_FAILED: 'signupErrors',
    LOGIN_FAILED: 'loginErrors',
    VERIFICATION_FAILED: 'verificationErrors',
    PASSWORD_RESET_FAILED: 'passwordResetErrors',
    EMAIL_SEND_FAILED: 'emailSendErrors',
  };

  const count = summary[fieldMap[errorType]] as number;
  const threshold = ALERT_THRESHOLDS[errorType];

  if (count >= threshold) {
    console.warn(
      `[AUTH ALERT] ${errorType} threshold exceeded: ${count} errors today (threshold: ${threshold})`
    );
  }
}

/**
 * Get recent auth errors for the admin dashboard
 */
export async function getRecentAuthErrors(options: {
  limit?: number;
  errorType?: AuthErrorType;
  isResolved?: boolean;
  startDate?: Date;
  endDate?: Date;
}) {
  const {
    limit = 50,
    errorType,
    isResolved,
    startDate,
    endDate,
  } = options;

  const where: Record<string, unknown> = {};

  if (errorType) {
    where.errorType = errorType;
  }

  if (isResolved !== undefined) {
    where.isResolved = isResolved;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      (where.createdAt as Record<string, Date>).gte = startDate;
    }
    if (endDate) {
      (where.createdAt as Record<string, Date>).lte = endDate;
    }
  }

  return prisma.authErrorLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      errorType: true,
      errorCode: true,
      email: true,
      endpoint: true,
      message: true,
      ipAddress: true,
      isResolved: true,
      resolvedAt: true,
      createdAt: true,
    },
  });
}

/**
 * Get error summary for a date range
 */
export async function getAuthErrorSummary(startDate: Date, endDate: Date) {
  const startKey = startDate.toISOString().split('T')[0];
  const endKey = endDate.toISOString().split('T')[0];

  return prisma.authErrorSummary.findMany({
    where: {
      dateKey: {
        gte: startKey,
        lte: endKey,
      },
    },
    orderBy: { dateKey: 'desc' },
  });
}

/**
 * Get error statistics for the current day
 */
export async function getTodayErrorStats() {
  const dateKey = new Date().toISOString().split('T')[0];

  const summary = await prisma.authErrorSummary.findUnique({
    where: { dateKey },
  });

  if (!summary) {
    return {
      date: dateKey,
      totalErrors: 0,
      signupErrors: 0,
      loginErrors: 0,
      verificationErrors: 0,
      passwordResetErrors: 0,
      emailSendErrors: 0,
    };
  }

  return {
    date: dateKey,
    totalErrors:
      summary.signupErrors +
      summary.loginErrors +
      summary.verificationErrors +
      summary.passwordResetErrors +
      summary.emailSendErrors,
    ...summary,
  };
}

/**
 * Mark an error as resolved
 */
export async function resolveAuthError(
  errorId: string,
  resolvedBy: string,
  resolution?: string
) {
  return prisma.authErrorLog.update({
    where: { id: errorId },
    data: {
      isResolved: true,
      resolvedAt: new Date(),
      resolvedBy,
      resolution,
    },
  });
}

/**
 * Get error breakdown by code for a specific error type
 */
export async function getErrorBreakdown(
  errorType: AuthErrorType,
  days: number = 7
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const errors = await prisma.authErrorLog.groupBy({
    by: ['errorCode'],
    where: {
      errorType,
      createdAt: { gte: startDate },
    },
    _count: { errorCode: true },
    orderBy: { _count: { errorCode: 'desc' } },
    take: 10,
  });

  return errors.map((e) => ({
    errorCode: e.errorCode,
    count: e._count.errorCode,
  }));
}
