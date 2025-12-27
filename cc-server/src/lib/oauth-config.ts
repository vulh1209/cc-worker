export function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/callback/google`,
    scopes: ['openid', 'email', 'profile'],
  };
}

// For backward compatibility
export const GOOGLE_CONFIG = {
  get clientId() { return getGoogleConfig().clientId; },
  get clientSecret() { return getGoogleConfig().clientSecret; },
  get redirectUri() { return getGoogleConfig().redirectUri; },
  get scopes() { return getGoogleConfig().scopes; },
};

export function isGoogleOAuthConfigured(): boolean {
  return !!(GOOGLE_CONFIG.clientId && GOOGLE_CONFIG.clientSecret);
}
