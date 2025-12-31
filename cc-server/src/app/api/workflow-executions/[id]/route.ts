import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireApiAuth } from '@/lib/api-auth';

// GET /api/workflow-executions/:id - Get execution details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const { id } = await params;

    const execution = await prisma.workflowExecution.findUnique({
      where: { id },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            description: true,
            steps: true,
          },
        },
        tasks: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            status: true,
            workflowStepIndex: true,
            result: true,
            errorMessage: true,
            duration: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!execution) {
      return NextResponse.json(
        { error: 'Workflow execution not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(execution);
  } catch (error) {
    console.error('Error fetching workflow execution:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflow execution' },
      { status: 500 }
    );
  }
}

// POST /api/workflow-executions/:id - Control execution (cancel, pause, resume)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    const execution = await prisma.workflowExecution.findUnique({
      where: { id },
      include: { tasks: true },
    });

    if (!execution) {
      return NextResponse.json(
        { error: 'Workflow execution not found' },
        { status: 404 }
      );
    }

    switch (action) {
      case 'cancel': {
        // Cancel all pending tasks
        await prisma.task.updateMany({
          where: {
            workflowExecutionId: id,
            status: { in: ['PENDING', 'RUNNING'] },
          },
          data: { status: 'CANCELLED' },
        });

        await prisma.workflowExecution.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            completedAt: new Date(),
          },
        });

        return NextResponse.json({ success: true, message: 'Workflow cancelled' });
      }

      case 'pause': {
        if (execution.status !== 'RUNNING') {
          return NextResponse.json(
            { error: 'Can only pause running workflows' },
            { status: 400 }
          );
        }

        await prisma.workflowExecution.update({
          where: { id },
          data: { status: 'PAUSED' },
        });

        return NextResponse.json({ success: true, message: 'Workflow paused' });
      }

      case 'resume': {
        if (execution.status !== 'PAUSED') {
          return NextResponse.json(
            { error: 'Can only resume paused workflows' },
            { status: 400 }
          );
        }

        await prisma.workflowExecution.update({
          where: { id },
          data: { status: 'RUNNING' },
        });

        return NextResponse.json({ success: true, message: 'Workflow resumed' });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: cancel, pause, or resume' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error controlling workflow execution:', error);
    return NextResponse.json(
      { error: 'Failed to control workflow execution' },
      { status: 500 }
    );
  }
}
