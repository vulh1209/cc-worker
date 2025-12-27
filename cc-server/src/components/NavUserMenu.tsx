import { getSessionUser } from '@/lib/auth';
import { UserMenu } from './UserMenu';

export async function NavUserMenu() {
  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  return <UserMenu user={user} />;
}
