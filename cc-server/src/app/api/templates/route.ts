import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireApiAuth } from '@/lib/api-auth';

// GET /api/templates - List all templates
export async function GET(request: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const where: Record<string, unknown> = { isPublic: true };
    if (category) where.category = category;

    const templates = await prisma.taskTemplate.findMany({
      where,
      orderBy: [
        { usageCount: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST /api/templates - Create new template
export async function POST(request: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const { name, description, prompt, category } = body;

    if (!name || !prompt) {
      return NextResponse.json(
        { error: 'Name and prompt are required' },
        { status: 400 }
      );
    }

    const template = await prisma.taskTemplate.create({
      data: {
        name,
        description,
        prompt,
        category,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  }
}
