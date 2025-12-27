import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireApiAuth } from '@/lib/api-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/tasks/:id/logs - Get task logs
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const after = searchParams.get('after'); // Timestamp for pagination
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    // Check if task exists
    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    const where: Record<string, unknown> = { taskId: id };
    if (after) {
      where.timestamp = { gt: new Date(after) };
    }

    const logs = await prisma.taskLog.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: limit,
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Error fetching task logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}
