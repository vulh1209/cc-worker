export const GOOGLE_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/callback/google`,
  scopes: ['openid', 'email', 'profile'],
};

export function isGoogleOAuthConfigured(): boolean {
  return !!(GOOGLE_CONFIG.clientId && GOOGLE_CONFIG.clientSecret);
}
