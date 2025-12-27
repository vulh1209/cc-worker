import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/components/AuthGuard';

export const dynamic = 'force-dynamic';

async function getTemplates() {
  return prisma.taskTemplate.findMany({
    where: { isPublic: true },
    orderBy: [
      { usageCount: 'desc' },
      { createdAt: 'desc' },
    ],
  });
}

async function getCategories() {
  const templates = await prisma.taskTemplate.findMany({
    where: { isPublic: true, category: { not: null } },
    select: { category: true },
    distinct: ['category'],
  });
  return templates.map((t) => t.category).filter(Boolean) as string[];
}

export default async function TemplatesPage() {
  await requireAuth('/templates');
  const [templates, categories] = await Promise.all([
    getTemplates(),
    getCategories(),
  ]);

  // Group templates by category
  const grouped = templates.reduce((acc, template) => {
    const cat = template.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(template);
    return acc;
  }, {} as Record<string, typeof templates>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Task Templates</h1>
          <p className="text-muted-foreground">
            Pre-defined prompts for common tasks
          </p>
        </div>
        <Link href="/templates/new">
          <Button>Create Template</Button>
        </Link>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <Badge key={category} variant="outline">
              {category}
            </Badge>
          ))}
        </div>
      )}

      {templates.length === 0 ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium">No templates yet</h3>
          <p className="text-muted-foreground mt-1">
            Create your first template to speed up task creation.
          </p>
          <Link href="/templates/new" className="mt-4 inline-block">
            <Button>Create Template</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, categoryTemplates]) => (
            <div key={category}>
              <h2 className="text-xl font-semibold mb-4">{category}</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {categoryTemplates.map((template) => (
                  <Card key={template.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      {template.description && (
                        <CardDescription>{template.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                        {template.prompt}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Used {template.usageCount} times
                        </span>
                        <Link href={`/tasks/new?templateId=${template.id}`}>
                          <Button size="sm">Use Template</Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
