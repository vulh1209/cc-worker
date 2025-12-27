import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_CONFIG, isGoogleOAuthConfigured } from '@/lib/oauth-config';
import { findOrCreateOAuthUser, createSession, setSessionCookie } from '@/lib/auth';
import { isEmailWhitelisted } from '@/lib/whitelist';

export async function GET(request: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(new URL('/login?error=oauth_not_configured', request.url));
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(new URL('/login?error=oauth_denied', request.url));
  }

  // Validate state (CSRF protection)
  const storedState = request.cookies.get('oauth_state')?.value;
  if (!state || state !== storedState) {
    console.error('Invalid OAuth state');
    return NextResponse.redirect(new URL('/login?error=invalid_state', request.url));
  }

  // Parse state to get redirect URL
  let redirectTo = '/';
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    redirectTo = stateData.redirect || '/';
  } catch {
    // Use default redirect if state parsing fails
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', request.url));
  }

  try {
    const client = new OAuth2Client(
      GOOGLE_CONFIG.clientId,
      GOOGLE_CONFIG.clientSecret,
      GOOGLE_CONFIG.redirectUri
    );

    // Exchange code for tokens
    const { tokens } = await client.getToken(code);

    if (!tokens.id_token) {
      throw new Error('No ID token received');
    }

    // Verify ID token and get user info
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CONFIG.clientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new Error('Invalid token payload');
    }

    // Check if email is whitelisted (exists in User table)
    if (!(await isEmailWhitelisted(payload.email))) {
      console.warn(`[Auth] Access denied for email: ${payload.email}`);
      return NextResponse.redirect(new URL('/login?error=not_whitelisted', request.url));
    }

    // Create or link user
    const user = await findOrCreateOAuthUser({
      email: payload.email,
      name: payload.name,
      googleId: payload.sub,
      avatarUrl: payload.picture,
    });

    // Create session
    const sessionToken = await createSession(user.id, {
      userAgent: request.headers.get('user-agent') || undefined,
    });

    await setSessionCookie(sessionToken);

    // Clear oauth state cookie and redirect to original page
    const response = NextResponse.redirect(new URL(redirectTo, request.url));
    response.cookies.delete('oauth_state');

    return response;
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url));
  }
}
