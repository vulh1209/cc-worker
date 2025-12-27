import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireApiAuth } from '@/lib/api-auth';

// GET /api/analytics - Get analytics data
export async function GET(request: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get task stats
    const [
      totalTasks,
      completedTasks,
      failedTasks,
      runningTasks,
      pendingTasks,
      cancelledTasks,
    ] = await Promise.all([
      prisma.task.count(),
      prisma.task.count({ where: { status: 'COMPLETED' } }),
      prisma.task.count({ where: { status: 'FAILED' } }),
      prisma.task.count({ where: { status: 'RUNNING' } }),
      prisma.task.count({ where: { status: 'PENDING' } }),
      prisma.task.count({ where: { status: 'CANCELLED' } }),
    ]);

    // Get worker stats
    const [totalWorkers, onlineWorkers, busyWorkers] = await Promise.all([
      prisma.worker.count(),
      prisma.worker.count({ where: { status: 'ONLINE' } }),
      prisma.worker.count({ where: { status: 'BUSY' } }),
    ]);

    // Get average task duration
    const avgDurationResult = await prisma.task.aggregate({
      _avg: { duration: true },
      where: { status: 'COMPLETED', duration: { not: null } },
    });

    // Get daily task counts for the period
    const dailyTasks = await prisma.$queryRaw<
      { date: Date; total: bigint; completed: bigint; failed: bigint }[]
    >`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM "Task"
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Get top workers by completed tasks
    const topWorkers = await prisma.worker.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        _count: {
          select: { tasks: true },
        },
      },
      orderBy: {
        tasks: {
          _count: 'desc',
        },
      },
      take: 5,
    });

    // Calculate success rate
    const totalFinished = completedTasks + failedTasks;
    const successRate = totalFinished > 0 ? (completedTasks / totalFinished) * 100 : 0;

    return NextResponse.json({
      overview: {
        totalTasks,
        completedTasks,
        failedTasks,
        runningTasks,
        pendingTasks,
        cancelledTasks,
        successRate: Math.round(successRate * 10) / 10,
        avgDuration: avgDurationResult._avg.duration,
      },
      workers: {
        total: totalWorkers,
        online: onlineWorkers,
        busy: busyWorkers,
        offline: totalWorkers - onlineWorkers,
      },
      dailyTasks: dailyTasks.map((d) => ({
        date: d.date,
        total: Number(d.total),
        completed: Number(d.completed),
        failed: Number(d.failed),
      })),
      topWorkers: topWorkers.map((w) => ({
        id: w.id,
        name: w.name,
        status: w.status,
        taskCount: w._count.tasks,
      })),
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
