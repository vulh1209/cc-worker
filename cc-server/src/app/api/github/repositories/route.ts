/**
 * GitHub Repositories API
 *
 * GET /api/github/repositories - List all configured repositories
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/github/repositories
 * List all GitHub repositories configured for PR review
 */
export async function GET(request: NextRequest) {
  try {
    const repositories = await prisma.gitHubRepository.findMany({
      include: {
        installation: {
          select: {
            accountLogin: true,
            accountType: true,
          },
        },
        assignedWorkers: {
          include: {
            worker: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
        _count: {
          select: {
            reviews: true,
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    return NextResponse.json({
      repositories: repositories.map((repo) => ({
        id: repo.id,
        repoId: repo.repoId,
        fullName: repo.fullName,
        owner: repo.owner,
        name: repo.name,
        autoReviewEnabled: repo.autoReviewEnabled,
        reviewOnMention: repo.reviewOnMention,
        installation: {
          accountLogin: repo.installation.accountLogin,
          accountType: repo.installation.accountType,
        },
        assignedWorkers: repo.assignedWorkers.map((aw) => ({
          id: aw.worker.id,
          name: aw.worker.name,
          status: aw.worker.status,
          assignedAt: aw.assignedAt,
        })),
        reviewCount: repo._count.reviews,
        createdAt: repo.createdAt,
      })),
    });
  } catch (error) {
    console.error('[API] Error fetching repositories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}
