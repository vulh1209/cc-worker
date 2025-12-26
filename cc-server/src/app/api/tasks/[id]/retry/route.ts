import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/tasks/:id/retry - Retry a failed task by creating a new task with same prompt
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        prompt: true,
        priority: true,
        workerId: true,
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Only allow retry of failed or cancelled tasks
    if (task.status !== 'FAILED' && task.status !== 'CANCELLED') {
      return NextResponse.json(
        { error: `Cannot retry task with status ${task.status}. Only FAILED or CANCELLED tasks can be retried.` },
        { status: 400 }
      );
    }

    // Create a new task with the same prompt
    const newTask = await prisma.task.create({
      data: {
        prompt: task.prompt,
        priority: task.priority,
        status: 'PENDING',
        // Optionally assign to same worker if specified
        workerId: task.workerId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Task retried',
      originalTaskId: id,
      newTaskId: newTask.id,
    });
  } catch (error) {
    console.error('Error retrying task:', error);
    return NextResponse.json(
      { error: 'Failed to retry task' },
      { status: 500 }
    );
  }
}
