/**
 * Consistency Service — Queries and Actions.
 */

import type { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/error.js';

export function createConsistencyService(deps: { prisma: PrismaClient }) {
  const { prisma } = deps;

  async function getSummary(clientId: string) {
    const profiles = await prisma.sourceProfile.findMany({ where: { clientId }, include: { consistencies: true } });
    const stats = profiles.map((p) => {
      const critical = p.consistencies.filter((c) => c.conflict === 'critical').length;
      const consistent = p.consistencies.filter((c) => c.conflict === 'consistent').length;
      return { source: p.source, status: p.status, lastScanned: p.lastScanned, critical, consistent, total: p.consistencies.length };
    });
    const totalCritical = stats.reduce((s, c) => s + c.critical, 0);
    const totalConsistent = stats.reduce((s, c) => s + c.consistent, 0);
    return { profiles: stats, totalCritical, totalConsistent };
  }

  async function getConflicts(clientId: string) {
    return prisma.sourceConsistency.findMany({
      where: { clientId, conflict: { in: ['critical', 'warning'] } },
      include: { profile: { select: { source: true } }, actions: true },
      orderBy: [{ conflict: 'asc' }, { fieldName: 'asc' }],
    });
  }

  async function createAction(consistencyId: string, clientId: string, data: { priority: string; action: string; note?: string }) {
    const c = await prisma.sourceConsistency.findFirst({ where: { id: consistencyId, clientId } });
    if (!c) throw new AppError(404, '一致性记录不存在');
    return prisma.consistencyAction.create({
      data: { clientId, consistencyId, priority: data.priority, action: data.action, note: data.note ?? null },
    });
  }

  async function getActions(clientId: string) {
    return prisma.consistencyAction.findMany({
      where: { clientId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async function updateAction(id: string, clientId: string, data: { status?: string; note?: string }) {
    const a = await prisma.consistencyAction.findFirst({ where: { id, clientId } });
    if (!a) throw new AppError(404, '行动项不存在');
    return prisma.consistencyAction.update({ where: { id }, data });
  }

  return { getSummary, getConflicts, createAction, getActions, updateAction };
}
