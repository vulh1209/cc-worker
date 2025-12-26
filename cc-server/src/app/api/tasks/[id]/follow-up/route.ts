import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getWorkerManager } from '@/lib/worker-manager';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/tasks/:id/follow-up - Create follow-up task in same session
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: parentTaskId } = await context.params;
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Get parent task with worker info
    const parentTask = await prisma.task.findUnique({
      where: { id: parentTaskId },
      include: {
        worker: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    if (!parentTask) {
      return NextResponse.json(
        { error: 'Parent task not found' },
        { status: 404 }
      );
    }

    // Validate parent task has a session to resume
    if (!parentTask.sessionId) {
      return NextResponse.json(
        { error: 'Parent task has no session to resume. Cannot create follow-up.' },
        { status: 400 }
      );
    }

    // Only allow follow-up on completed tasks
    if (parentTask.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: `Cannot follow-up on task with status: ${parentTask.status}. Only COMPLETED tasks can be continued.` },
        { status: 400 }
      );
    }

    // Check if worker is available
    if (!parentTask.worker) {
      return NextResponse.json(
        { error: 'Parent task has no assigned worker. Cannot resume session.' },
        { status: 400 }
      );
    }

    if (parentTask.worker.status !== 'ONLINE') {
      return NextResponse.json(
        { error: `Worker "${parentTask.worker.name}" is ${parentTask.worker.status}. Cannot resume session. Please wait until worker is online.` },
        { status: 400 }
      );
    }

    // Create follow-up task linked to parent
    const task = await prisma.task.create({
      data: {
        prompt: prompt.trim(),
        status: 'PENDING',
        parentTaskId: parentTaskId,
        workerId: parentTask.workerId,  // Same worker for session locality
      },
      include: {
        worker: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    // Assign to same worker with session resume info
    const workerManager = getWorkerManager();
    if (workerManager && parentTask.workerId) {
      const assigned = await workerManager.assignTask(
        parentTask.workerId,
        task.id,
        prompt.trim(),
        parentTask.sessionId,  // Pass session ID for resume
        parentTaskId
      );

      if (!assigned) {
        // Worker might have disconnected between check and assign
        await prisma.task.update({
          where: { id: task.id },
          data: { status: 'FAILED', errorMessage: 'Failed to assign task to worker' },
        });

        return NextResponse.json(
          { error: 'Failed to assign follow-up task to worker' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('[API] Follow-up error:', error);
    return NextResponse.json(
      { error: 'Failed to create follow-up task' },
      { status: 500 }
    );
  }
}
