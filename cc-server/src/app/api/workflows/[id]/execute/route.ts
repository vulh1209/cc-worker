import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireApiAuth } from '@/lib/api-auth';
import type { WorkflowStep } from '@/lib/workflow-types';

// POST /api/workflows/:id/execute - Start workflow execution
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireApiAuth();
  if (error) return error;

  try {
    const { id } = await params;
    const body = await request.json();
    const { variables, workerId } = body;

    // Fetch workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id },
    });

    if (!workflow) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    if (!workflow.isActive) {
      return NextResponse.json(
        { error: 'Workflow is not active' },
        { status: 400 }
      );
    }

    const steps = workflow.steps as unknown as WorkflowStep[];

    // Create workflow execution record
    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId: id,
        status: 'PENDING',
        totalSteps: steps.length,
        variables: variables || {},
        workerId,
      },
    });

    // Create the first task for the workflow
    const firstStep = steps[0];
    const prompt = substituteVariables(firstStep.prompt, variables);

    const task = await prisma.task.create({
      data: {
        prompt,
        status: 'PENDING',
        taskType: 'REGULAR',
        workflowExecutionId: execution.id,
        workflowStepIndex: 0,
        ...(workerId && { workerId }),
      },
    });

    // Update execution with task reference
    await prisma.workflowExecution.update({
      where: { id: execution.id },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    // Increment workflow usage count
    await prisma.workflow.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });

    return NextResponse.json({
      executionId: execution.id,
      taskId: task.id,
      message: `Started workflow execution with ${steps.length} steps`,
    });
  } catch (error) {
    console.error('Error executing workflow:', error);
    return NextResponse.json(
      { error: 'Failed to start workflow execution' },
      { status: 500 }
    );
  }
}

/**
 * Substitute variables in prompt template
 */
function substituteVariables(
  template: string,
  variables?: Record<string, unknown>
): string {
  if (!variables) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    return value !== undefined ? String(value) : match;
  });
}
