/**
 * Migration script: Assign all workers without owner to the first admin user
 *
 * Usage: npx tsx scripts/migrate-worker-owner.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Starting worker owner migration...\n');

  // Find the first admin user, or first user if no admin
  let firstUser = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!firstUser) {
    firstUser = await prisma.user.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!firstUser) {
    console.error('❌ No users found in database. Please create a user first.');
    process.exit(1);
  }

  console.log(`📧 Using user: ${firstUser.email} (${firstUser.role})\n`);

  // Find all workers without owner
  const orphanWorkers = await prisma.worker.findMany({
    where: { ownerId: null },
    select: { id: true, name: true, createdAt: true },
  });

  if (orphanWorkers.length === 0) {
    console.log('✅ No workers without owner found. Nothing to migrate.');
    return;
  }

  console.log(`📋 Found ${orphanWorkers.length} workers without owner:\n`);
  orphanWorkers.forEach((w) => {
    console.log(`   - ${w.name} (${w.id})`);
  });

  // Update all orphan workers
  const result = await prisma.worker.updateMany({
    where: { ownerId: null },
    data: { ownerId: firstUser.id },
  });

  console.log(`\n✅ Successfully assigned ${result.count} workers to ${firstUser.email}`);
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
