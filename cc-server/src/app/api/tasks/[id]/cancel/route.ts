import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getWorkerManager } from '@/lib/worker-manager';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/tasks/:id/cancel - Cancel a task
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get task
    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Only running tasks can be cancelled
    if (task.status !== 'RUNNING') {
      return NextResponse.json(
        { error: 'Task is not running' },
        { status: 400 }
      );
    }

    // Cancel on worker
    if (task.workerId) {
      const workerManager = getWorkerManager();
      if (workerManager) {
        await workerManager.cancelTask(task.workerId, id);
      }
    }

    // Update task status
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error('Error cancelling task:', error);
    return NextResponse.json(
      { error: 'Failed to cancel task' },
      { status: 500 }
    );
  }
}
