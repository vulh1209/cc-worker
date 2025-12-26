import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/workers/:id - Get worker details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const worker = await prisma.worker.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        _count: {
          select: { tasks: true },
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
      apiKeyPreview: apiKey.substring(0, 15) + '...',
    });
  } catch (error) {
    console.error('Error fetching worker:', error);
    return NextResponse.json(
      { error: 'Failed to fetch worker' },
      { status: 500 }
    );
  }
}

// DELETE /api/workers/:id - Delete worker
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

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
    console.error('Error deleting worker:', error);
    return NextResponse.json(
      { error: 'Failed to delete worker' },
      { status: 500 }
    );
  }
}
