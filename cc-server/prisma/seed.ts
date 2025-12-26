import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  // Create dev worker
  const apiKey = 'worker_dev_key';
  const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

  const worker = await prisma.worker.upsert({
    where: { apiKey },
    update: {},
    create: {
      name: 'dev-worker',
      apiKey,
      apiKeyHash,
      status: 'OFFLINE',
    },
  });

  console.log('Created worker:', worker);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
