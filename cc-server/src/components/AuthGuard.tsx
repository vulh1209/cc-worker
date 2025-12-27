import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

// Helper to require auth in a page - throws redirect if not authenticated
export async function requireAuth(redirectTo?: string) {
  const user = await getSessionUser();

  if (!user) {
    const loginUrl = redirectTo
      ? `/login?redirect=${encodeURIComponent(redirectTo)}`
      : '/login';
    redirect(loginUrl);
  }

  return user;
}

export async function getCurrentUser() {
  return getSessionUser();
}
