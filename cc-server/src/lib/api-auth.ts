import { NextResponse } from 'next/server';
import { getSessionUser } from './auth';

// Helper to require authentication for API routes
// Returns user if authenticated, or error response if not
export async function requireApiAuth() {
  const user = await getSessionUser();

  if (!user) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  return { user, error: null };
}

// Helper to require admin role for API routes
export async function requireApiAdmin() {
  const user = await getSessionUser();

  if (!user) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  if (user.role !== 'ADMIN') {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      ),
    };
  }

  return { user, error: null };
}
