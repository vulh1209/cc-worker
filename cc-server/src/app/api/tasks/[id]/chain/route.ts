import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tasks/:id/chain - Get task chain for navigation (2 previous + 1 next)
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: taskId } = await context.params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        parentTaskId: true,
      },
    }) as { id: string; parentTaskId: string | null } | null;

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Get previous tasks (up to 2) by walking the parent chain
    const previousTasks: Array<{ id: string; prompt: string; status: string; createdAt: Date }> = [];
    let currentParentId: string | null = task.parentTaskId;

    while (currentParentId && previousTasks.length < 2) {
      const parentTask = await prisma.task.findUnique({
        where: { id: currentParentId },
        select: {
          id: true,
          prompt: true,
          status: true,
          createdAt: true,
          parentTaskId: true,
        },
      });

      if (!parentTask) break;

      previousTasks.push({
        id: parentTask.id,
        prompt: parentTask.prompt,
        status: parentTask.status,
        createdAt: parentTask.createdAt,
      });

      currentParentId = parentTask.parentTaskId;
    }

    // Reverse so oldest comes first (for display order: grandparent → parent → current)
    previousTasks.reverse();

    // Get next task (follow-up) - only 1 since it's 1-1
    const nextTask = await prisma.task.findFirst({
      where: { parentTaskId: taskId },
      select: {
        id: true,
        prompt: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      previousTasks,
      nextTask,
    });
  } catch (error) {
    console.error('[API] Chain error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task chain' },
      { status: 500 }
    );
  }
}
