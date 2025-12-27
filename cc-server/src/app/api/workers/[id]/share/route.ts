import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireWorkerAccess } from '@/lib/worker-permissions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/workers/:id/share - List users this worker is shared with
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await requireWorkerAccess(id, 'view');

    const shares = await prisma.workerShare.findMany({
      where: { workerId: id },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: { sharedAt: 'desc' },
    });

    return NextResponse.json(shares);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('Error fetching shares:', error);
    return NextResponse.json({ error: 'Failed to fetch shares' }, { status: 500 });
  }
}

// POST /api/workers/:id/share - Share worker with a user
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const access = await requireWorkerAccess(id, 'manage');

    // Only owner can share
    if (!access.isOwner) {
      return NextResponse.json(
        { error: 'Only the owner can share this worker' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find user by email
    const targetUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Cannot share with yourself
    if (targetUser.id === access.userId) {
      return NextResponse.json(
        { error: 'Cannot share with yourself' },
        { status: 400 }
      );
    }

    // Check if already shared
    const existingShare = await prisma.workerShare.findUnique({
      where: { workerId_userId: { workerId: id, userId: targetUser.id } },
    });

    if (existingShare) {
      return NextResponse.json(
        { error: 'Worker already shared with this user' },
        { status: 400 }
      );
    }

    // Create share
    const share = await prisma.workerShare.create({
      data: {
        workerId: id,
        userId: targetUser.id,
        sharedBy: access.userId,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    return NextResponse.json(share);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('Error sharing worker:', error);
    return NextResponse.json({ error: 'Failed to share worker' }, { status: 500 });
  }
}

// DELETE /api/workers/:id/share?userId=xxx - Remove share
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const access = await requireWorkerAccess(id, 'manage');

    // Only owner can revoke shares
    if (!access.isOwner) {
      return NextResponse.json(
        { error: 'Only the owner can remove shares' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    await prisma.workerShare.delete({
      where: { workerId_userId: { workerId: id, userId } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('Error removing share:', error);
    return NextResponse.json({ error: 'Failed to remove share' }, { status: 500 });
  }
}
