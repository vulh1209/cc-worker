import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import { getSessionUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

async function getUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

export default async function AdminUsersPage() {
  const user = await getSessionUser();

  if (!user || user.role !== 'ADMIN') {
    redirect('/login');
  }

  const users = await getUsers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            Manage user accounts and permissions
          </p>
        </div>
        <Link href="/admin/users/new">
          <Button>Add User</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {users.map((u) => (
              <div key={u.id} className="py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{u.email}</p>
                    <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>
                      {u.role}
                    </Badge>
                    {!u.isActive && (
                      <Badge variant="destructive">Inactive</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {u.name || 'No name'} &bull; Last login:{' '}
                    {formatRelativeTime(u.lastLoginAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ToggleActiveButton userId={u.id} isActive={u.isActive} />
                  <ToggleRoleButton userId={u.id} currentRole={u.role} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleActiveButton({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  return (
    <form
      action={async () => {
        'use server';
        const { getSessionUser } = await import('@/lib/auth');
        const user = await getSessionUser();
        if (!user || user.role !== 'ADMIN') return;

        const { default: prisma } = await import('@/lib/prisma');
        await prisma.user.update({
          where: { id: userId },
          data: { isActive: !isActive },
        });

        const { revalidatePath } = await import('next/cache');
        revalidatePath('/admin/users');
      }}
    >
      <Button type="submit" variant="outline" size="sm">
        {isActive ? 'Deactivate' : 'Activate'}
      </Button>
    </form>
  );
}

function ToggleRoleButton({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: string;
}) {
  return (
    <form
      action={async () => {
        'use server';
        const { getSessionUser } = await import('@/lib/auth');
        const user = await getSessionUser();
        if (!user || user.role !== 'ADMIN') return;

        const { default: prisma } = await import('@/lib/prisma');
        await prisma.user.update({
          where: { id: userId },
          data: { role: currentRole === 'ADMIN' ? 'USER' : 'ADMIN' },
        });

        const { revalidatePath } = await import('next/cache');
        revalidatePath('/admin/users');
      }}
    >
      <Button type="submit" variant="outline" size="sm">
        {currentRole === 'ADMIN' ? 'Make User' : 'Make Admin'}
      </Button>
    </form>
  );
}
