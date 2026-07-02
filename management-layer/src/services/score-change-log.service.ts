/**
 * Score Change Log Service.
 */

import type { PrismaClient } from '@prisma/client';

export function createScoreChangeLogService(deps: { prisma: PrismaClient }) {
  const { prisma } = deps;

  async function logChange(scoreId: string, clientId: string, previousScore: number | null, newScore: number, reason: string) {
    // Only log changes ≥ 5 points to reduce noise
    if (previousScore !== null && Math.abs(newScore - previousScore) < 5) {
      return null;
    }

    return prisma.scoreChangeLog.create({
      data: { clientId, scoreId, previousScore, newScore, reason },
    });
  }

  async function getChanges(clientId: string, limit: number = 20) {
    return prisma.scoreChangeLog.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  return { logChange, getChanges };
}
