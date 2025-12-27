import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireWorkerAccess } from '@/lib/worker-permissions';
import { getApiKeyPreview } from '@/lib/utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/workers/:id - Get worker details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check view access
    const access = await requireWorkerAccess(id, 'view');

    const worker = await prisma.worker.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        _count: {
          select: { tasks: true, sharedWith: true },
        },
        owner: {
          select: { id: true, email: true, name: true },
        },
        sharedWith: {
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
      },
    });

    if (!worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      );
    }

    // Don't expose the full API key
    const { apiKey, apiKeyHash, ...safeWorker } = worker;
    return NextResponse.json({
      ...safeWorker,
      apiKeyPreview: getApiKeyPreview(apiKey),
      isOwner: access.isOwner,
      canDelete: access.isOwner,
      canShare: access.isOwner,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('Error fetching worker:', error);
    return NextResponse.json(
      { error: 'Failed to fetch worker' },
      { status: 500 }
    );
  }
}

// DELETE /api/workers/:id - Delete worker (owner only)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check delete access (only owner can delete)
    await requireWorkerAccess(id, 'delete');

    // Check if worker exists
    const worker = await prisma.worker.findUnique({
      where: { id },
    });

    if (!worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      );
    }

    // Delete worker (tasks will remain but workerId will be null due to optional relation)
    await prisma.worker.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('Error deleting worker:', error);
    return NextResponse.json(
      { error: 'Failed to delete worker' },
      { status: 500 }
    );
  }
}
