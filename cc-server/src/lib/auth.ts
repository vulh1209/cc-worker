import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import prisma from './prisma';

const SESSION_COOKIE_NAME = 'cc_session';
const SESSION_DURATION_DAYS = 7;

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

// Simple in-memory session store (use Redis in production)
const sessions = new Map<string, { userId: string; expiresAt: Date }>();

// Create session
export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  sessions.set(token, { userId, expiresAt });

  return token;
}

// Verify session and get user
export async function getSessionUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  const session = sessions.get(sessionToken);
  if (!session) {
    return null;
  }

  if (session.expiresAt < new Date()) {
    sessions.delete(sessionToken);
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  return user;
}

// Delete session
export async function deleteSession(token: string): Promise<void> {
  sessions.delete(token);
}

// Set session cookie
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
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
  const cookieStore = await cookies();
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
