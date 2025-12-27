import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireApiAuth } from '@/lib/api-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/tasks/:id - Get task details
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        worker: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        logs: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task' },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/:id - Delete a task (only FAILED, COMPLETED, or CANCELLED)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Only allow deletion of non-active tasks
    if (task.status === 'RUNNING' || task.status === 'PENDING') {
      return NextResponse.json(
        { error: `Cannot delete task with status ${task.status}. Cancel it first.` },
        { status: 400 }
      );
    }

    // Delete task logs first (cascade), then delete task
    await prisma.$transaction([
      prisma.taskLog.deleteMany({ where: { taskId: id } }),
      prisma.task.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}
