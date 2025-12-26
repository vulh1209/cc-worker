import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateApiKey, hashApiKey } from '@/lib/utils';

// GET /api/workers - List all workers
export async function GET() {
  try {
    const workers = await prisma.worker.findMany({
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
        _count: {
          select: { tasks: true },
        },
      },
    });

    return NextResponse.json(workers);
  } catch (error) {
    console.error('Error fetching workers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workers' },
      { status: 500 }
    );
  }
}

// POST /api/workers - Create new worker (generate API key)
export async function POST(request: NextRequest) {
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

    // Create worker
    const worker = await prisma.worker.create({
      data: {
        name,
        apiKey, // Store raw key (for display once)
        apiKeyHash, // Store hash for verification
      },
    });

    // Return worker with API key (only shown once!)
    return NextResponse.json({
      id: worker.id,
      name: worker.name,
      apiKey: apiKey, // Only returned on creation
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
