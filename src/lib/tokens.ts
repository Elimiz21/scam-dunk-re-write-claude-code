/**
 * Token Generation and Verification
 *
 * Handles creation and validation of email verification and password reset tokens.
 */

import { prisma } from './db';
import crypto from 'crypto';

const EMAIL_VERIFICATION_EXPIRY_HOURS = 24;
const PASSWORD_RESET_EXPIRY_HOURS = 1;

/**
 * Generate a secure random token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create an email verification token
 */
export async function createEmailVerificationToken(email: string): Promise<string> {
  // Delete any existing tokens for this email
  await prisma.emailVerificationToken.deleteMany({
    where: { email },
  });

  const token = generateToken();
  const expires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.create({
    data: {
      email,
      token,
      expires,
    },
  });

  return token;
}

/**
 * Verify an email verification token
 */
export async function verifyEmailVerificationToken(token: string): Promise<{ valid: boolean; email?: string }> {
  const verificationToken = await prisma.emailVerificationToken.findUnique({
    where: { token },
  });

  if (!verificationToken) {
    return { valid: false };
  }

  if (verificationToken.expires < new Date()) {
    // Token expired, delete it
    await prisma.emailVerificationToken.delete({
      where: { id: verificationToken.id },
    });
    return { valid: false };
  }

  // Token is valid - delete it and return email
  await prisma.emailVerificationToken.delete({
    where: { id: verificationToken.id },
  });

  return { valid: true, email: verificationToken.email };
}

/**
 * Create a password reset token
 */
export async function createPasswordResetToken(email: string): Promise<string> {
  // Delete any existing tokens for this email
  await prisma.passwordResetToken.deleteMany({
    where: { email },
  });

  const token = generateToken();
  const expires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      email,
      token,
      expires,
    },
  });

  return token;
}

/**
 * Verify a password reset token
 */
export async function verifyPasswordResetToken(token: string): Promise<{ valid: boolean; email?: string }> {
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
  });

  if (!resetToken) {
    return { valid: false };
  }

  if (resetToken.expires < new Date()) {
    // Token expired, delete it
    await prisma.passwordResetToken.delete({
      where: { id: resetToken.id },
    });
    return { valid: false };
  }

  return { valid: true, email: resetToken.email };
}

/**
 * Consume (use and delete) a password reset token
 */
export async function consumePasswordResetToken(token: string): Promise<{ valid: boolean; email?: string }> {
  const result = await verifyPasswordResetToken(token);

  if (result.valid) {
    // Delete the token after use
    await prisma.passwordResetToken.deleteMany({
      where: { token },
    });
  }

  return result;
}
