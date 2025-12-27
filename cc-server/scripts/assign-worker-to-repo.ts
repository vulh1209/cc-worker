/**
 * Script to assign a worker to a GitHub repository for PR reviews.
 *
 * Usage:
 *   pnpm run db:assign-repo                    # Interactive - assigns first worker to first repo
 *   pnpm run db:assign-repo -- --list          # List all workers and repos
 *   pnpm run db:assign-repo -- --worker=<id> --repo=<id>  # Specific assignment
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);

  // List mode
  if (args.includes('--list')) {
    console.log('\n=== Workers ===');
    const workers = await prisma.worker.findMany({
      select: { id: true, name: true, status: true },
    });
    workers.forEach((w) => console.log(`  ${w.id} - ${w.name} (${w.status})`));

    console.log('\n=== GitHub Repositories ===');
    const repos = await prisma.gitHubRepository.findMany({
      select: { id: true, fullName: true, autoReviewEnabled: true },
    });
    repos.forEach((r) =>
      console.log(`  ${r.id} - ${r.fullName} (autoReview: ${r.autoReviewEnabled})`)
    );

    console.log('\n=== Current Assignments ===');
    const assignments = await prisma.workerRepository.findMany({
      include: { worker: true, repository: true },
    });
    if (assignments.length === 0) {
      console.log('  (none)');
    } else {
      assignments.forEach((a) =>
        console.log(`  ${a.worker.name} -> ${a.repository.fullName}`)
      );
    }
    return;
  }

  // Parse worker and repo IDs from args
  let workerId: string | undefined;
  let repoId: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--worker=')) {
      workerId = arg.split('=')[1];
    }
    if (arg.startsWith('--repo=')) {
      repoId = arg.split('=')[1];
    }
  }

  // If not specified, use first available
  if (!workerId) {
    const worker = await prisma.worker.findFirst();
    if (!worker) {
      console.error('No workers found in database');
      process.exit(1);
    }
    workerId = worker.id;
    console.log(`Using first worker: ${worker.name} (${worker.id})`);
  }

  if (!repoId) {
    const repo = await prisma.gitHubRepository.findFirst();
    if (!repo) {
      console.error('No GitHub repositories found in database');
      console.log('Install the GitHub App on a repository first.');
      process.exit(1);
    }
    repoId = repo.id;
    console.log(`Using first repo: ${repo.fullName} (${repo.id})`);
  }

  // Check if assignment already exists
  const existing = await prisma.workerRepository.findUnique({
    where: {
      workerId_repositoryId: { workerId, repositoryId: repoId },
    },
  });

  if (existing) {
    console.log('\n✅ Assignment already exists!');
    return;
  }

  // Create assignment
  const assignment = await prisma.workerRepository.create({
    data: {
      workerId,
      repositoryId: repoId,
    },
    include: { worker: true, repository: true },
  });

  console.log(
    `\n✅ Assigned worker "${assignment.worker.name}" to repo "${assignment.repository.fullName}"`
  );
  console.log('\nNow you can test PR review by commenting @cc-worker-review-bot in a PR!');
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
