/**
 * Migration script to assign existing workers (without owner) to the first admin user.
 * Run this after applying the schema changes that add ownerId to Worker model.
 *
 * Usage: pnpm run db:assign-workers
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function assignWorkersToFirstAdmin() {
  console.log('Starting worker ownership migration...\n');

  // Find first admin user
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!admin) {
    console.log('No admin user found.');
    console.log('Workers will remain unassigned until an admin is created.');
    console.log('Run this script again after creating an admin user.\n');
    return;
  }

  console.log(`Found admin: ${admin.email} (${admin.id})`);

  // Find all workers without an owner
  const orphanedWorkers = await prisma.worker.findMany({
    where: { ownerId: null },
    select: { id: true, name: true },
  });

  if (orphanedWorkers.length === 0) {
    console.log('\nNo orphaned workers found. All workers have owners.');
    return;
  }

  console.log(`\nFound ${orphanedWorkers.length} workers without owner:`);
  orphanedWorkers.forEach((w) => console.log(`  - ${w.name} (${w.id})`));

  // Assign all orphaned workers to the first admin
  const result = await prisma.worker.updateMany({
    where: { ownerId: null },
    data: { ownerId: admin.id },
  });

  console.log(`\nAssigned ${result.count} workers to admin: ${admin.email}`);
  console.log('Migration completed successfully!');
}

assignWorkersToFirstAdmin()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
