import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const ids = {
  userA: '10000000-0000-4000-8000-00000000000a',
  userB: '10000000-0000-4000-8000-00000000000b',
  userC: '10000000-0000-4000-8000-00000000000c',
  userD: '10000000-0000-4000-8000-00000000000d',
  alpha: '20000000-0000-4000-8000-00000000000a',
  beta: '20000000-0000-4000-8000-00000000000b',
  alphaA: '30000000-0000-4000-8000-00000000000a',
  alphaB: '30000000-0000-4000-8000-00000000000b',
  alphaC: '30000000-0000-4000-8000-00000000000c',
  alphaDRemoved: '30000000-0000-4000-8000-00000000000d',
  betaD: '30000000-0000-4000-8000-00000000000e',
  pendingInvite: '40000000-0000-4000-8000-00000000000a',
  expiredInvite: '40000000-0000-4000-8000-00000000000b',
} as const;

async function main(): Promise<void> {
  if (!['local', 'test'].includes(process.env['APP_ENV'] ?? 'local')) {
    throw new Error('Phase 1 fixtures are restricted to local/test environments');
  }
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const now = new Date();
  const removedAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const expiredCreatedAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const expiredAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    await prisma.$transaction(async (transaction) => {
      for (const user of [
        {
          id: ids.userA,
          subject: 'development|fixture-a',
          email: 'a@turntable.local',
          name: 'User A',
        },
        {
          id: ids.userB,
          subject: 'development|fixture-b',
          email: 'b@turntable.local',
          name: 'User B',
        },
        {
          id: ids.userC,
          subject: 'development|fixture-c',
          email: 'c@turntable.local',
          name: 'User C',
        },
        {
          id: ids.userD,
          subject: 'development|fixture-d',
          email: 'd@turntable.local',
          name: 'Outsider D',
        },
      ]) {
        await transaction.user.upsert({
          where: { id: user.id },
          create: {
            id: user.id,
            oidcSubject: user.subject,
            email: user.email,
            displayName: user.name,
          },
          update: { email: user.email, displayName: user.name },
        });
      }

      await transaction.household.upsert({
        where: { id: ids.alpha },
        create: {
          id: ids.alpha,
          name: 'Household Alpha',
          timezone: 'America/New_York',
          currency: 'USD',
          createdByUserId: ids.userA,
        },
        update: { name: 'Household Alpha', timezone: 'America/New_York', currency: 'USD' },
      });
      await transaction.household.upsert({
        where: { id: ids.beta },
        create: {
          id: ids.beta,
          name: 'Household Beta',
          timezone: 'UTC',
          currency: 'USD',
          createdByUserId: ids.userD,
        },
        update: { name: 'Household Beta', timezone: 'UTC', currency: 'USD' },
      });

      for (const membership of [
        {
          id: ids.alphaA,
          householdId: ids.alpha,
          userId: ids.userA,
          role: 'OWNER' as const,
          status: 'ACTIVE' as const,
          leftAt: null,
        },
        {
          id: ids.alphaB,
          householdId: ids.alpha,
          userId: ids.userB,
          role: 'MEMBER' as const,
          status: 'ACTIVE' as const,
          leftAt: null,
        },
        {
          id: ids.alphaC,
          householdId: ids.alpha,
          userId: ids.userC,
          role: 'MEMBER' as const,
          status: 'ACTIVE' as const,
          leftAt: null,
        },
        {
          id: ids.alphaDRemoved,
          householdId: ids.alpha,
          userId: ids.userD,
          role: 'MEMBER' as const,
          status: 'REMOVED' as const,
          leftAt: removedAt,
        },
        {
          id: ids.betaD,
          householdId: ids.beta,
          userId: ids.userD,
          role: 'OWNER' as const,
          status: 'ACTIVE' as const,
          leftAt: null,
        },
      ]) {
        await transaction.householdMembership.upsert({
          where: {
            householdId_userId: {
              householdId: membership.householdId,
              userId: membership.userId,
            },
          },
          create: membership,
          update: {
            role: membership.role,
            status: membership.status,
            leftAt: membership.leftAt,
          },
        });
      }

      await transaction.householdInvitation.upsert({
        where: { id: ids.pendingInvite },
        create: {
          id: ids.pendingInvite,
          householdId: ids.alpha,
          createdByMemberId: ids.alphaA,
          tokenHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          invitedEmail: 'pending@turntable.local',
          status: 'PENDING',
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
        update: {
          invitedEmail: 'pending@turntable.local',
          status: 'PENDING',
          acceptedByUserId: null,
          acceptedAt: null,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      await transaction.householdInvitation.upsert({
        where: { id: ids.expiredInvite },
        create: {
          id: ids.expiredInvite,
          householdId: ids.alpha,
          createdByMemberId: ids.alphaA,
          tokenHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          status: 'EXPIRED',
          createdAt: expiredCreatedAt,
          expiresAt: expiredAt,
        },
        update: {
          status: 'EXPIRED',
          acceptedByUserId: null,
          acceptedAt: null,
          expiresAt: expiredAt,
        },
      });
    });
    process.stdout.write('Phase 1 local fixtures are ready.\n');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
