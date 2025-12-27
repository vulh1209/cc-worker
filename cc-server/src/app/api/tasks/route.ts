import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getWorkerManager } from '@/lib/worker-manager';
import { requireApiAuth } from '@/lib/api-auth';

// GET /api/tasks - List all tasks
export async function GET(request: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const workerId = searchParams.get('workerId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (workerId) where.workerId = workerId;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          worker: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({
      tasks,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

// POST /api/tasks - Create new task
export async function POST(request: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const { prompt, workerId } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        prompt,
        status: 'PENDING',
        workerId: workerId || null,
      },
    });

    // If workerId specified, try to assign immediately
    if (workerId) {
      const workerManager = getWorkerManager();
      if (workerManager) {
        const assigned = await workerManager.assignTask(workerId, task.id, prompt);
        if (!assigned) {
          // Worker not connected, keep task as pending
          console.log(`Worker ${workerId} not connected, task ${task.id} queued`);
        }
      }
    } else {
      // Find an online worker and assign
      const onlineWorker = await prisma.worker.findFirst({
        where: { status: 'ONLINE' },
        orderBy: { lastSeen: 'desc' },
      });

      if (onlineWorker) {
        const workerManager = getWorkerManager();
        if (workerManager) {
          const assigned = await workerManager.assignTask(onlineWorker.id, task.id, prompt);
          if (assigned) {
            await prisma.task.update({
              where: { id: task.id },
              data: { workerId: onlineWorker.id },
            });
          }
        }
      }
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}
