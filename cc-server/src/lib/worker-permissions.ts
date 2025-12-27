import prisma from './prisma';
import { getSessionUser } from './auth';

export type WorkerPermission = 'view' | 'manage' | 'delete';

export interface WorkerAccessResult {
  hasAccess: boolean;
  isOwner: boolean;
  isShared: boolean;
  userId: string;
}

/**
 * Check if current user has access to a worker
 * - Owner: all permissions (view, manage, delete)
 * - Shared user: view + manage only (no delete)
 */
export async function checkWorkerAccess(
  workerId: string,
  permission: WorkerPermission = 'view'
): Promise<WorkerAccessResult> {
  const user = await getSessionUser();
  if (!user) {
    return { hasAccess: false, isOwner: false, isShared: false, userId: '' };
  }

  // Check if user is owner
  const worker = await prisma.worker.findUnique({
    where: { id: workerId },
    select: { ownerId: true },
  });

  if (!worker) {
    return { hasAccess: false, isOwner: false, isShared: false, userId: user.id };
  }

  const isOwner = worker.ownerId === user.id;

  // Owners have all permissions
  if (isOwner) {
    return { hasAccess: true, isOwner: true, isShared: false, userId: user.id };
  }

  // Check if shared with user
  const share = await prisma.workerShare.findUnique({
    where: { workerId_userId: { workerId, userId: user.id } },
  });

  const isShared = !!share;

  // Shared users cannot delete
  if (permission === 'delete' && isShared) {
    return { hasAccess: false, isOwner: false, isShared: true, userId: user.id };
  }

  // Shared users can view and manage
  return { hasAccess: isShared, isOwner: false, isShared, userId: user.id };
}

/**
 * Require access to a worker, throw if not authorized
 */
export async function requireWorkerAccess(
  workerId: string,
  permission: WorkerPermission = 'view'
): Promise<WorkerAccessResult> {
  const access = await checkWorkerAccess(workerId, permission);
  if (!access.hasAccess) {
    if (!access.userId) {
      throw new Error('Unauthorized: Please log in');
    }
    throw new Error(`Unauthorized: You do not have ${permission} access to this worker`);
  }
  return access;
}

/**
 * Get all worker IDs that a user can access (owned + shared)
 */
export async function getAccessibleWorkerIds(userId: string): Promise<string[]> {
  // Get owned workers
  const ownedWorkers = await prisma.worker.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });

  // Get shared workers
  const sharedWorkers = await prisma.workerShare.findMany({
    where: { userId },
    select: { workerId: true },
  });

  return [
    ...ownedWorkers.map((w) => w.id),
    ...sharedWorkers.map((s) => s.workerId),
  ];
}

/**
 * Check if user can share a worker (only owner can share)
 */
export async function canShareWorker(workerId: string): Promise<boolean> {
  const access = await checkWorkerAccess(workerId, 'manage');
  return access.isOwner;
}
