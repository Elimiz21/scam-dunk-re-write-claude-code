export function googleCredentials() {
  const clientId = process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function isVerifiedGoogleProfile(profile?: { email?: unknown; email_verified?: unknown }): boolean {
  return profile?.email_verified === true && typeof profile.email === "string" &&
    profile.email.trim().length > 0;
}
