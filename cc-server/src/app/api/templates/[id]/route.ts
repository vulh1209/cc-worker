import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/templates/:id - Get template
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const template = await prisma.taskTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

// PUT /api/templates/:id - Update template
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, prompt, category, isPublic } = body;

    const template = await prisma.taskTemplate.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(prompt && { prompt }),
        ...(category !== undefined && { category }),
        ...(isPublic !== undefined && { isPublic }),
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}

// DELETE /api/templates/:id - Delete template
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    await prisma.taskTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}

// POST /api/templates/:id/use - Increment usage count
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const template = await prisma.taskTemplate.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error('Error updating template usage:', error);
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}
