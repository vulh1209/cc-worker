import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PUT /api/workers/:id/orchestrator - Make worker the orchestrator
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

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

    // Check if there's already an orchestrator
    const existingOrchestrator = await prisma.worker.findFirst({
      where: { isOrchestrator: true, id: { not: id } },
    });

    if (existingOrchestrator) {
      return NextResponse.json(
        {
          error: 'Another worker is already the orchestrator',
          existingOrchestrator: {
            id: existingOrchestrator.id,
            name: existingOrchestrator.name,
          }
        },
        { status: 409 }
      );
    }

    // Update worker to be orchestrator
    const updatedWorker = await prisma.worker.update({
      where: { id },
      data: {
        isOrchestrator: true,
        orchestratorConfig: body.config || {
          fallbackMode: 'hybrid',
          maxDepth: 3,
          timeoutMs: 60000,
        },
      },
    });

    const { apiKey, apiKeyHash, ...safeWorker } = updatedWorker;
    return NextResponse.json({
      ...safeWorker,
      message: 'Worker is now the orchestrator',
    });
  } catch (error) {
    console.error('Error setting orchestrator:', error);
    return NextResponse.json(
      { error: 'Failed to set orchestrator' },
      { status: 500 }
    );
  }
}

// DELETE /api/workers/:id/orchestrator - Remove orchestrator role
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check if worker exists and is orchestrator
    const worker = await prisma.worker.findUnique({
      where: { id },
    });

    if (!worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      );
    }

    if (!worker.isOrchestrator) {
      return NextResponse.json(
        { error: 'Worker is not an orchestrator' },
        { status: 400 }
      );
    }

    // Remove orchestrator role
    const updatedWorker = await prisma.worker.update({
      where: { id },
      data: {
        isOrchestrator: false,
        orchestratorConfig: undefined,  // Use undefined instead of null for Prisma
      },
    });

    const { apiKey, apiKeyHash, ...safeWorker } = updatedWorker;
    return NextResponse.json({
      ...safeWorker,
      message: 'Orchestrator role removed',
    });
  } catch (error) {
    console.error('Error removing orchestrator:', error);
    return NextResponse.json(
      { error: 'Failed to remove orchestrator' },
      { status: 500 }
    );
  }
}

// GET /api/workers/:id/orchestrator - Get orchestrator status
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const worker = await prisma.worker.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isOrchestrator: true,
        orchestratorConfig: true,
        status: true,
      },
    });

    if (!worker) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(worker);
  } catch (error) {
    console.error('Error getting orchestrator status:', error);
    return NextResponse.json(
      { error: 'Failed to get orchestrator status' },
      { status: 500 }
    );
  }
}
