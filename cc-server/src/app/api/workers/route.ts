import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateApiKey, hashApiKey } from '@/lib/utils';
import { requireApiAuth } from '@/lib/api-auth';

// GET /api/workers - List workers (owned + shared with current user)
export async function GET() {
  const { user, error } = await requireApiAuth();
  if (error) return error;

  try {
    const workers = await prisma.worker.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { sharedWith: { some: { userId: user.id } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        os: true,
        hostname: true,
        ipAddress: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
        ownerId: true,
        owner: {
          select: { id: true, email: true, name: true },
        },
        _count: {
          select: { tasks: true, sharedWith: true },
        },
      },
    });

    // Add ownership info to response
    const workersWithOwnership = workers.map((w) => ({
      ...w,
      isOwner: w.ownerId === user.id,
      isShared: w.ownerId !== user.id,
    }));

    return NextResponse.json(workersWithOwnership);
  } catch (error) {
    console.error('Error fetching workers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workers' },
      { status: 500 }
    );
  }
}

// POST /api/workers - Create new worker (requires auth)
export async function POST(request: NextRequest) {
  const { user, error } = await requireApiAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Worker name is required' },
        { status: 400 }
      );
    }

    // Generate API key
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    // Create worker with owner
    const worker = await prisma.worker.create({
      data: {
        name,
        apiKey,
        apiKeyHash,
        ownerId: user.id,
      },
    });

    // Return worker with API key (only shown once!)
    return NextResponse.json({
      id: worker.id,
      name: worker.name,
      apiKey: apiKey,
      status: worker.status,
      createdAt: worker.createdAt,
    });
  } catch (error) {
    console.error('Error creating worker:', error);
    return NextResponse.json(
      { error: 'Failed to create worker' },
      { status: 500 }
    );
  }
}
