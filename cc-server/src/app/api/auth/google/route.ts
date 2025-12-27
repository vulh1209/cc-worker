import { NextRequest, NextResponse } from 'next/server';
import { GOOGLE_CONFIG, isGoogleOAuthConfigured } from '@/lib/oauth-config';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured' },
      { status: 500 }
    );
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');

  // Get redirect URL from query params
  const redirectTo = request.nextUrl.searchParams.get('redirect') || '/';

  // Generate state for CSRF protection (include redirect URL)
  const stateData = JSON.stringify({
    csrf: randomBytes(16).toString('hex'),
    redirect: redirectTo,
  });
  const state = Buffer.from(stateData).toString('base64url');

  authUrl.searchParams.set('client_id', GOOGLE_CONFIG.clientId);
  authUrl.searchParams.set('redirect_uri', GOOGLE_CONFIG.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_CONFIG.scopes.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(authUrl);

  // Store state in cookie for CSRF validation
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  return response;
}
