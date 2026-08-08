import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { APP_LOGGER } from '../../../common/logging/logging.tokens';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

export interface HouseholdMembershipContext {
  membershipId: string;
  householdId: string;
  userId: string;
  role: 'OWNER' | 'MEMBER';
  status: 'ACTIVE';
  version: number;
}

@Injectable()
export class HouseholdAuthorizationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_LOGGER) private readonly logger: Logger,
  ) {}

  async getMembershipContext(
    userId: string,
    householdId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<HouseholdMembershipContext | null> {
    const where = { userId, householdId, status: 'ACTIVE' as const };
    const membership = transaction
      ? await transaction.householdMembership.findFirst({ where })
      : await this.prisma.householdMembership.findFirst({ where });
    if (!membership) return null;
    return {
      membershipId: membership.id,
      householdId: membership.householdId,
      userId: membership.userId,
      role: membership.role,
      status: 'ACTIVE',
      version: membership.version,
    };
  }

  async requireActiveMembership(
    userId: string,
    householdId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<HouseholdMembershipContext> {
    const membership = await this.getMembershipContext(userId, householdId, transaction);
    if (!membership) {
      this.logger.warn(
        { operation: 'household_authorization', result: 'denied', user_id: userId },
        'active household membership required',
      );
      throw new ForbiddenException({
        code: 'HOUSEHOLD_ACCESS_DENIED',
        message: 'Active household membership is required',
      });
    }
    return membership;
  }

  async requireHouseholdOwner(
    userId: string,
    householdId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<HouseholdMembershipContext> {
    const membership = await this.requireActiveMembership(userId, householdId, transaction);
    if (membership.role !== 'OWNER') {
      this.logger.warn(
        { operation: 'household_owner_authorization', result: 'denied', user_id: userId },
        'household owner role required',
      );
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Household owner role is required',
      });
    }
    return membership;
  }
}
