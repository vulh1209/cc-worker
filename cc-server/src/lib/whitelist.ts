// Email whitelist - checks against User table in database
import prisma from './prisma';

/**
 * Check if an email is whitelisted (exists in User table and is active)
 * Admin can add users via /admin/users page or directly in database
 */
export async function isEmailWhitelisted(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { isActive: true },
  });

  // User must exist and be active
  if (!user) {
    console.warn(`[Whitelist] Email not found in database: ${email}`);
    return false;
  }

  if (!user.isActive) {
    console.warn(`[Whitelist] User is deactivated: ${email}`);
    return false;
  }

  return true;
}

/**
 * Get all whitelisted emails from database
 */
export async function getWhitelistedEmails(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { email: true },
  });
  return users.map((u) => u.email);
}
