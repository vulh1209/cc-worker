import { createHash, randomBytes } from 'crypto';
import prisma from './prisma';

const SESSION_COOKIE_NAME = 'cc_session';
const SESSION_DURATION_DAYS = 7;

// Dynamic import to avoid AsyncLocalStorage error when running outside Next.js
async function getCookieStore() {
  // @ts-ignore - next/headers only available in Next.js runtime
  const { cookies } = await import('next/headers');
  return cookies();
}

// Hash password
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(password + salt)
    .digest('hex');
  return `${salt}:${hash}`;
}

// Verify password
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = createHash('sha256')
    .update(password + salt)
    .digest('hex');
  return hash === verifyHash;
}

// Generate session token
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

// Create session (stored in database)
export async function createSession(
  userId: string,
  metadata?: { userAgent?: string; ipAddress?: string }
): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    },
  });

  return token;
}

// Verify session and get user (from database)
export async function getSessionUser() {
  const cookieStore = await getCookieStore();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  // Check if session expired
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return session.user;
}

// Delete session
export async function deleteSession(token: string): Promise<void> {
  await prisma.session.delete({ where: { token } }).catch(() => {
    // Session may already be deleted
  });
}

// Delete all sessions for a user
export async function deleteAllUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

// Set session cookie
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await getCookieStore();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

// Clear session cookie
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await getCookieStore();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

// Check if user is admin
export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== 'ADMIN') {
    throw new Error('Unauthorized: Admin access required');
  }
  return user;
}

// Check if user is authenticated
export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('Unauthorized: Please log in');
  }
  return user;
}

// Find or create OAuth user
export async function findOrCreateOAuthUser(profile: {
  email: string;
  name?: string;
  googleId: string;
  avatarUrl?: string;
}) {
  // Check if user exists with this Google ID
  let user = await prisma.user.findUnique({
    where: { googleId: profile.googleId },
  });

  if (user) {
    // Update name/avatar if changed
    return prisma.user.update({
      where: { id: user.id },
      data: {
        name: profile.name || user.name,
        avatarUrl: profile.avatarUrl || user.avatarUrl,
        lastLoginAt: new Date(),
      },
    });
  }

  // Check if user exists with same email (link accounts)
  const existingByEmail = await prisma.user.findUnique({
    where: { email: profile.email },
  });

  if (existingByEmail) {
    // Link Google account to existing user
    return prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        googleId: profile.googleId,
        avatarUrl: profile.avatarUrl || existingByEmail.avatarUrl,
        name: profile.name || existingByEmail.name,
        lastLoginAt: new Date(),
      },
    });
  }

  // Create new user - check if first user for ADMIN role
  const userCount = await prisma.user.count();
  const isFirstUser = userCount === 0;

  return prisma.user.create({
    data: {
      email: profile.email,
      name: profile.name,
      googleId: profile.googleId,
      avatarUrl: profile.avatarUrl,
      role: isFirstUser ? 'ADMIN' : 'USER',
      lastLoginAt: new Date(),
    },
  });
}

// Cleanup expired sessions
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}
