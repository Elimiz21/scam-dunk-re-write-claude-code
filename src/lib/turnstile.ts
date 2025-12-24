/**
 * Cloudflare Turnstile Verification
 *
 * Verifies Turnstile CAPTCHA tokens server-side to prevent bot signups.
 */

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verify a Turnstile token
 * @param token - The token from the client-side Turnstile widget
 * @param ip - Optional IP address for additional validation
 * @returns Whether the verification succeeded
 */
export async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  // If no secret key configured, skip verification (for development)
  if (!TURNSTILE_SECRET_KEY) {
    console.warn('TURNSTILE_SECRET_KEY not configured, skipping CAPTCHA verification');
    return true;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data: TurnstileVerifyResponse = await response.json();

    if (!data.success) {
      console.error('Turnstile verification failed:', data['error-codes']);
    }

    return data.success;
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return false;
  }
}
