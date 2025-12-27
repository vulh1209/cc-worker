/**
 * Worker Repository Assignments API
 *
 * GET    /api/workers/:id/repositories - List repos assigned to worker
 * POST   /api/workers/:id/repositories - Assign repo to worker
 * DELETE /api/workers/:id/repositories - Remove repo assignment
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/workers/:id/repositories
 * List all repositories assigned to a worker
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const assignments = await prisma.workerRepository.findMany({
      where: { workerId: id },
      include: {
        repository: {
          include: {
            installation: {
              select: {
                accountLogin: true,
                accountType: true,
              },
            },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    return NextResponse.json({
      workerId: id,
      repositories: assignments.map((a) => ({
        id: a.id,
        repositoryId: a.repositoryId,
        fullName: a.repository.fullName,
        owner: a.repository.owner,
        name: a.repository.name,
        autoReviewEnabled: a.repository.autoReviewEnabled,
        reviewOnMention: a.repository.reviewOnMention,
        installation: a.repository.installation.accountLogin,
        assignedAt: a.assignedAt,
      })),
    });
  } catch (error) {
    console.error('[API] Error fetching worker repositories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workers/:id/repositories
 * Assign a repository to a worker
 * Body: { repositoryId: string } or { fullName: "owner/repo" }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workerId } = await params;

  try {
    const body = await request.json();
    const { repositoryId, fullName } = body;

    // Verify worker exists
    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
    });

    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    // Find repository by ID or fullName
    let repository;
    if (repositoryId) {
      repository = await prisma.gitHubRepository.findUnique({
        where: { id: repositoryId },
      });
    } else if (fullName) {
      const [owner, name] = fullName.split('/');
      repository = await prisma.gitHubRepository.findUnique({
        where: { owner_name: { owner, name } },
      });
    } else {
      return NextResponse.json(
        { error: 'Either repositoryId or fullName is required' },
        { status: 400 }
      );
    }

    if (!repository) {
      return NextResponse.json(
        { error: 'Repository not found. Make sure the GitHub App is installed on this repo.' },
        { status: 404 }
      );
    }

    // Create assignment (upsert to handle duplicates)
    const assignment = await prisma.workerRepository.upsert({
      where: {
        workerId_repositoryId: {
          workerId,
          repositoryId: repository.id,
        },
      },
      create: {
        workerId,
        repositoryId: repository.id,
      },
      update: {
        assignedAt: new Date(), // Update timestamp on re-assignment
      },
      include: {
        repository: true,
      },
    });

    console.log(
      `[API] Assigned worker ${worker.name} to repo ${repository.fullName}`
    );

    return NextResponse.json({
      success: true,
      assignment: {
        id: assignment.id,
        workerId: assignment.workerId,
        repositoryId: assignment.repositoryId,
        fullName: assignment.repository.fullName,
        assignedAt: assignment.assignedAt,
      },
    });
  } catch (error) {
    console.error('[API] Error assigning repository:', error);
    return NextResponse.json(
      { error: 'Failed to assign repository' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workers/:id/repositories
 * Remove a repository assignment from a worker
 * Body: { repositoryId: string } or { fullName: "owner/repo" }
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workerId } = await params;

  try {
    const body = await request.json();
    const { repositoryId, fullName } = body;

    // Find repository
    let repository;
    if (repositoryId) {
      repository = await prisma.gitHubRepository.findUnique({
        where: { id: repositoryId },
      });
    } else if (fullName) {
      const [owner, name] = fullName.split('/');
      repository = await prisma.gitHubRepository.findUnique({
        where: { owner_name: { owner, name } },
      });
    } else {
      return NextResponse.json(
        { error: 'Either repositoryId or fullName is required' },
        { status: 400 }
      );
    }

    if (!repository) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    // Delete assignment
    await prisma.workerRepository.delete({
      where: {
        workerId_repositoryId: {
          workerId,
          repositoryId: repository.id,
        },
      },
    });

    console.log(
      `[API] Removed worker ${workerId} from repo ${repository.fullName}`
    );

    return NextResponse.json({
      success: true,
      message: `Removed assignment for ${repository.fullName}`,
    });
  } catch (error) {
    // Handle case where assignment doesn't exist
    if ((error as any).code === 'P2025') {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      );
    }

    console.error('[API] Error removing assignment:', error);
    return NextResponse.json(
      { error: 'Failed to remove assignment' },
      { status: 500 }
    );
  }
}
