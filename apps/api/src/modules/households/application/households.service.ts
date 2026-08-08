import { createHash, createHmac } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Logger } from 'pino';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { APP_LOGGER } from '../../../common/logging/logging.tokens';
import type { Environment } from '../../../config/environment';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  CreateHouseholdRequestDto,
  CreateInvitationRequestDto,
  HouseholdDto,
  HouseholdListItemDto,
  InvitationDto,
  MemberDto,
  OwnershipTransferResponseDto,
  TransferOwnershipRequestDto,
  UpdateHouseholdRequestDto,
} from '../api/household.dto';
import { HouseholdAuthorizationService } from './household-authorization.service';

const memberInclude = {
  user: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.HouseholdMembershipInclude;

type MemberRecord = Prisma.HouseholdMembershipGetPayload<{ include: typeof memberInclude }>;

interface StoredInvitationResponse {
  id: string;
  household_id: string;
  status: 'PENDING';
  invited_email: string | null;
  expires_at: string;
}

type InvitationAcceptanceOutcome =
  | { kind: 'success'; member: MemberDto }
  | { kind: 'error'; status: number; code: string; message: string };

@Injectable()
export class HouseholdsService {
  private readonly invitationTokenSecret: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HouseholdAuthorizationService)
    private readonly authorization: HouseholdAuthorizationService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(ConfigService) config: ConfigService<Environment, true>,
    @Inject(APP_LOGGER) private readonly logger: Logger,
  ) {
    this.invitationTokenSecret = config.get('INVITATION_TOKEN_SECRET', { infer: true });
  }

  async createHousehold(
    actorUserId: string,
    idempotencyKey: string,
    request: CreateHouseholdRequestDto,
  ): Promise<HouseholdDto> {
    this.idempotency.assertKey(idempotencyKey);
    const logicalRequest = {
      name: request.name.trim(),
      timezone: request.timezone,
      currency: request.currency.toUpperCase(),
    };
    const result = await this.idempotency.execute<HouseholdDto>({
      actorUserId,
      operationScope: 'households.create',
      idempotencyKey,
      logicalRequest,
      work: async (transaction) => {
        const household = await transaction.household.create({
          data: { ...logicalRequest, createdByUserId: actorUserId },
        });
        const owner = await transaction.householdMembership.create({
          data: {
            householdId: household.id,
            userId: actorUserId,
            role: 'OWNER',
            status: 'ACTIVE',
          },
        });
        await transaction.activityEvent.createMany({
          data: [
            {
              householdId: household.id,
              actorMemberId: owner.id,
              eventType: 'HOUSEHOLD_CREATED',
              entityType: 'HOUSEHOLD',
              entityId: household.id,
              metadata: {},
            },
            {
              householdId: household.id,
              actorMemberId: owner.id,
              eventType: 'MEMBER_JOINED',
              entityType: 'HOUSEHOLD_MEMBERSHIP',
              entityId: owner.id,
              metadata: { member_id: owner.id, role: 'OWNER' },
            },
          ],
        });
        await transaction.outboxEvent.create({
          data: {
            householdId: household.id,
            eventType: 'MEMBER_JOINED',
            aggregateType: 'HOUSEHOLD_MEMBERSHIP',
            aggregateId: owner.id,
            payload: { household_id: household.id, member_id: owner.id },
          },
        });
        return { status: 200, body: this.mapHousehold(household) };
      },
    });
    this.logger.info(
      {
        operation: 'households.create',
        result: result.replayed ? 'replayed' : 'created',
        household_id: result.body.id,
      },
      'household creation completed',
    );
    return result.body;
  }

  async listHouseholds(actorUserId: string): Promise<HouseholdListItemDto[]> {
    const households = await this.prisma.household.findMany({
      where: { memberships: { some: { userId: actorUserId, status: 'ACTIVE' } } },
      include: {
        memberships: {
          where: { userId: actorUserId, status: 'ACTIVE' },
          select: { id: true, role: true, status: true },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return households.map((household) => {
      const membership = household.memberships[0];
      if (!membership) throw new Error('Active household query returned no caller membership');
      return {
        household: this.mapHousehold(household),
        membership: { id: membership.id, role: membership.role, status: 'ACTIVE' },
      };
    });
  }

  async getHousehold(actorUserId: string, householdId: string): Promise<HouseholdDto> {
    await this.authorization.requireActiveMembership(actorUserId, householdId);
    const household = await this.prisma.household.findUnique({ where: { id: householdId } });
    if (!household) {
      throw new ForbiddenException({
        code: 'HOUSEHOLD_ACCESS_DENIED',
        message: 'Active household membership is required',
      });
    }
    return this.mapHousehold(household);
  }

  async updateHousehold(
    actorUserId: string,
    householdId: string,
    request: UpdateHouseholdRequestDto,
  ): Promise<HouseholdDto> {
    if (request.name === undefined && request.timezone === undefined) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'At least one mutable household setting is required',
        errors: [{ field: 'body', reason: 'no_mutable_fields' }],
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.lockHousehold(transaction, householdId);
      const owner = await this.authorization.requireHouseholdOwner(
        actorUserId,
        householdId,
        transaction,
      );
      const current = await transaction.household.findUnique({ where: { id: householdId } });
      if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
      if (current.version !== request.expected_version) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Household version does not match expected_version',
        });
      }
      const changes = {
        ...(request.name !== undefined ? { name: request.name.trim() } : {}),
        ...(request.timezone !== undefined ? { timezone: request.timezone } : {}),
      };
      const updated = await transaction.household.update({
        where: { id: householdId },
        data: { ...changes, version: { increment: 1 } },
      });
      await transaction.activityEvent.create({
        data: {
          householdId,
          actorMemberId: owner.membershipId,
          eventType: 'HOUSEHOLD_UPDATED',
          entityType: 'HOUSEHOLD',
          entityId: householdId,
          metadata: { changed_fields: Object.keys(changes) },
        },
      });
      this.logger.info(
        { operation: 'households.update', result: 'updated', household_id: householdId },
        'household settings updated',
      );
      return this.mapHousehold(updated);
    });
  }

  async listMembers(actorUserId: string, householdId: string): Promise<MemberDto[]> {
    await this.authorization.requireActiveMembership(actorUserId, householdId);
    const members = await this.prisma.householdMembership.findMany({
      where: { householdId, status: 'ACTIVE' },
      include: memberInclude,
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    });
    return members.map((member) => this.mapMember(member));
  }

  async createInvitation(
    actorUserId: string,
    householdId: string,
    idempotencyKey: string,
    request: CreateInvitationRequestDto,
  ): Promise<InvitationDto> {
    this.idempotency.assertKey(idempotencyKey);
    const logicalRequest = {
      household_id: householdId,
      invited_email: request.invited_email?.trim().toLowerCase() ?? null,
      expires_in_hours: request.expires_in_hours ?? 24,
    };
    const requestHash = this.idempotency.requestHash(logicalRequest);
    const rawToken = createHmac('sha256', this.invitationTokenSecret)
      .update(`v1:${actorUserId}:household-invitations.create:${idempotencyKey}:${requestHash}`)
      .digest('base64url');
    const tokenHash = this.hashInvitationToken(rawToken);
    const result = await this.idempotency.execute<StoredInvitationResponse>({
      actorUserId,
      operationScope: 'household-invitations.create',
      idempotencyKey,
      logicalRequest,
      work: async (transaction) => {
        await this.lockHousehold(transaction, householdId);
        const owner = await this.authorization.requireHouseholdOwner(
          actorUserId,
          householdId,
          transaction,
        );
        const expiresAt = new Date(Date.now() + logicalRequest.expires_in_hours * 60 * 60 * 1000);
        const invitation = await transaction.householdInvitation.create({
          data: {
            householdId,
            createdByMemberId: owner.membershipId,
            tokenHash,
            invitedEmail: logicalRequest.invited_email,
            expiresAt,
          },
        });
        await transaction.activityEvent.create({
          data: {
            householdId,
            actorMemberId: owner.membershipId,
            eventType: 'INVITATION_CREATED',
            entityType: 'HOUSEHOLD_INVITATION',
            entityId: invitation.id,
            metadata: {
              invitation_id: invitation.id,
              has_email_binding: !!invitation.invitedEmail,
            },
          },
        });
        return {
          status: 200,
          body: {
            id: invitation.id,
            household_id: invitation.householdId,
            status: 'PENDING',
            invited_email: invitation.invitedEmail,
            expires_at: invitation.expiresAt.toISOString(),
          },
        };
      },
    });
    this.logger.info(
      {
        operation: 'household-invitations.create',
        result: result.replayed ? 'replayed' : 'created',
        household_id: householdId,
      },
      'household invitation creation completed',
    );
    return { ...result.body, token: rawToken };
  }

  async acceptInvitation(
    actorUserId: string,
    actorEmail: string | null,
    rawToken: string,
    idempotencyKey: string,
  ): Promise<MemberDto> {
    this.idempotency.assertKey(idempotencyKey);
    if (!/^[A-Za-z0-9_-]{32,200}$/.test(rawToken)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invitation is unavailable' });
    }
    const tokenHash = this.hashInvitationToken(rawToken);
    const result = await this.idempotency.execute<InvitationAcceptanceOutcome>({
      actorUserId,
      operationScope: 'household-invitations.accept',
      idempotencyKey,
      logicalRequest: { token_hash: tokenHash },
      work: async (transaction) => {
        const locked = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id
          FROM "household_invitations"
          WHERE "token_hash" = ${tokenHash}
          FOR UPDATE
        `;
        if (!locked[0]) return this.invitationError(404, 'NOT_FOUND');
        const invitation = await transaction.householdInvitation.findUnique({
          where: { id: locked[0].id },
        });
        if (!invitation) return this.invitationError(404, 'NOT_FOUND');
        if (invitation.status === 'PENDING' && invitation.expiresAt <= new Date()) {
          await transaction.householdInvitation.update({
            where: { id: invitation.id },
            data: { status: 'EXPIRED' },
          });
          return this.invitationError(409, 'CONFLICT');
        }
        if (invitation.status !== 'PENDING') return this.invitationError(409, 'CONFLICT');
        if (
          invitation.invitedEmail &&
          invitation.invitedEmail.toLowerCase() !== actorEmail?.toLowerCase()
        ) {
          return this.invitationError(404, 'NOT_FOUND');
        }
        const existingMembership = await transaction.householdMembership.findUnique({
          where: {
            householdId_userId: { householdId: invitation.householdId, userId: actorUserId },
          },
        });
        if (existingMembership?.status === 'ACTIVE') {
          return this.invitationError(409, 'CONFLICT');
        }
        const membership = existingMembership
          ? await transaction.householdMembership.update({
              where: { id: existingMembership.id },
              data: {
                role: 'MEMBER',
                status: 'ACTIVE',
                joinedAt: new Date(),
                leftAt: null,
                version: { increment: 1 },
              },
              include: memberInclude,
            })
          : await transaction.householdMembership.create({
              data: {
                householdId: invitation.householdId,
                userId: actorUserId,
                role: 'MEMBER',
                status: 'ACTIVE',
              },
              include: memberInclude,
            });
        await transaction.householdInvitation.update({
          where: { id: invitation.id },
          data: { status: 'ACCEPTED', acceptedByUserId: actorUserId, acceptedAt: new Date() },
        });
        await transaction.activityEvent.create({
          data: {
            householdId: invitation.householdId,
            actorMemberId: membership.id,
            eventType: 'MEMBER_JOINED',
            entityType: 'HOUSEHOLD_MEMBERSHIP',
            entityId: membership.id,
            metadata: { member_id: membership.id, role: 'MEMBER' },
          },
        });
        await transaction.outboxEvent.create({
          data: {
            householdId: invitation.householdId,
            eventType: 'MEMBER_JOINED',
            aggregateType: 'HOUSEHOLD_MEMBERSHIP',
            aggregateId: membership.id,
            payload: { household_id: invitation.householdId, member_id: membership.id },
          },
        });
        return { status: 200, body: { kind: 'success', member: this.mapMember(membership) } };
      },
    });
    if (result.body.kind === 'error') {
      this.logger.warn(
        { operation: 'household-invitations.accept', result: 'rejected', user_id: actorUserId },
        'household invitation acceptance rejected',
      );
      throw new HttpException(
        { code: result.body.code, message: result.body.message },
        result.body.status,
      );
    }
    this.logger.info(
      {
        operation: 'household-invitations.accept',
        result: result.replayed ? 'replayed' : 'accepted',
        household_id: result.body.member.household_id,
      },
      'household invitation accepted',
    );
    return result.body.member;
  }

  async removeMember(
    actorUserId: string,
    householdId: string,
    memberId: string,
    idempotencyKey: string,
  ): Promise<MemberDto> {
    this.idempotency.assertKey(idempotencyKey);
    const result = await this.idempotency.execute<MemberDto>({
      actorUserId,
      operationScope: 'household-members.remove',
      idempotencyKey,
      logicalRequest: { household_id: householdId, member_id: memberId },
      work: async (transaction) => {
        await this.authorization.requireHouseholdOwner(actorUserId, householdId, transaction);
        await this.lockHousehold(transaction, householdId);
        const owner = await this.authorization.getMembershipContext(
          actorUserId,
          householdId,
          transaction,
        );
        if (!owner || owner.role !== 'OWNER') {
          throw new ConflictException({ code: 'CONFLICT', message: 'Household ownership changed' });
        }
        const target = await transaction.householdMembership.findFirst({
          where: { id: memberId, householdId },
          include: memberInclude,
        });
        if (!target)
          throw new NotFoundException({ code: 'NOT_FOUND', message: 'Member not found' });
        if (target.status !== 'ACTIVE') {
          throw new ConflictException({ code: 'CONFLICT', message: 'Member is not active' });
        }
        if (target.role === 'OWNER') {
          throw new ConflictException({
            code: 'CONFLICT',
            message: 'Transfer ownership before removing the active owner',
          });
        }
        const removed = await transaction.householdMembership.update({
          where: { id: target.id },
          data: { status: 'REMOVED', leftAt: new Date(), version: { increment: 1 } },
          include: memberInclude,
        });
        await transaction.activityEvent.create({
          data: {
            householdId,
            actorMemberId: owner.membershipId,
            eventType: 'MEMBER_REMOVED',
            entityType: 'HOUSEHOLD_MEMBERSHIP',
            entityId: removed.id,
            metadata: { member_id: removed.id },
          },
        });
        await transaction.outboxEvent.create({
          data: {
            householdId,
            eventType: 'MEMBER_REMOVED',
            aggregateType: 'HOUSEHOLD_MEMBERSHIP',
            aggregateId: removed.id,
            payload: { household_id: householdId, member_id: removed.id },
          },
        });
        return { status: 200, body: this.mapMember(removed) };
      },
    });
    this.logger.info(
      {
        operation: 'household-members.remove',
        result: result.replayed ? 'replayed' : 'removed',
        household_id: householdId,
      },
      'household member removal completed',
    );
    return result.body;
  }

  async transferOwnership(
    actorUserId: string,
    householdId: string,
    idempotencyKey: string,
    request: TransferOwnershipRequestDto,
  ): Promise<OwnershipTransferResponseDto> {
    this.idempotency.assertKey(idempotencyKey);
    const result = await this.idempotency.execute<OwnershipTransferResponseDto>({
      actorUserId,
      operationScope: 'household-ownership.transfer',
      idempotencyKey,
      logicalRequest: { household_id: householdId, target_member_id: request.target_member_id },
      work: async (transaction) => {
        await this.authorization.requireHouseholdOwner(actorUserId, householdId, transaction);
        await this.lockHousehold(transaction, householdId);
        const owner = await this.authorization.getMembershipContext(
          actorUserId,
          householdId,
          transaction,
        );
        if (!owner || owner.role !== 'OWNER') {
          throw new ConflictException({ code: 'CONFLICT', message: 'Household ownership changed' });
        }
        const target = await transaction.householdMembership.findFirst({
          where: {
            id: request.target_member_id,
            householdId,
            status: 'ACTIVE',
            role: 'MEMBER',
          },
        });
        if (!target) {
          throw new ConflictException({
            code: 'CONFLICT',
            message: 'Ownership target must be another active member of this household',
          });
        }
        await transaction.householdMembership.update({
          where: { id: owner.membershipId },
          data: { role: 'MEMBER', version: { increment: 1 } },
        });
        await transaction.householdMembership.update({
          where: { id: target.id },
          data: { role: 'OWNER', version: { increment: 1 } },
        });
        const [previousOwner, newOwner] = await Promise.all([
          transaction.householdMembership.findUniqueOrThrow({
            where: { id: owner.membershipId },
            include: memberInclude,
          }),
          transaction.householdMembership.findUniqueOrThrow({
            where: { id: target.id },
            include: memberInclude,
          }),
        ]);
        await transaction.activityEvent.create({
          data: {
            householdId,
            actorMemberId: owner.membershipId,
            eventType: 'OWNERSHIP_TRANSFERRED',
            entityType: 'HOUSEHOLD',
            entityId: householdId,
            metadata: {
              previous_owner_member_id: previousOwner.id,
              new_owner_member_id: newOwner.id,
            },
          },
        });
        await transaction.outboxEvent.create({
          data: {
            householdId,
            eventType: 'OWNERSHIP_TRANSFERRED',
            aggregateType: 'HOUSEHOLD',
            aggregateId: householdId,
            payload: {
              household_id: householdId,
              previous_owner_member_id: previousOwner.id,
              new_owner_member_id: newOwner.id,
            },
          },
        });
        return {
          status: 200,
          body: {
            household_id: householdId,
            previous_owner: this.mapMember(previousOwner),
            new_owner: this.mapMember(newOwner),
          },
        };
      },
    });
    this.logger.info(
      {
        operation: 'household-ownership.transfer',
        result: result.replayed ? 'replayed' : 'transferred',
        household_id: householdId,
      },
      'household ownership transfer completed',
    );
    return result.body;
  }

  private async lockHousehold(
    transaction: Prisma.TransactionClient,
    householdId: string,
  ): Promise<void> {
    const locked = await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM "households" WHERE id = ${householdId}::uuid FOR UPDATE
    `;
    if (!locked[0]) {
      throw new ForbiddenException({
        code: 'HOUSEHOLD_ACCESS_DENIED',
        message: 'Active household membership is required',
      });
    }
  }

  private invitationError(
    status: number,
    code: 'NOT_FOUND' | 'CONFLICT',
  ): { status: number; body: InvitationAcceptanceOutcome } {
    return {
      status,
      body: {
        kind: 'error',
        status,
        code,
        message: status === 404 ? 'Invitation is unavailable' : 'Invitation cannot be accepted',
      },
    };
  }

  private hashInvitationToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private mapHousehold(household: {
    id: string;
    name: string;
    timezone: string;
    currency: string;
    version: number;
  }): HouseholdDto {
    return {
      id: household.id,
      name: household.name,
      timezone: household.timezone,
      currency: household.currency,
      version: household.version,
    };
  }

  private mapMember(member: MemberRecord): MemberDto {
    return {
      id: member.id,
      household_id: member.householdId,
      user: {
        id: member.user.id,
        display_name: member.user.displayName,
        email: member.user.email,
      },
      role: member.role,
      status: member.status,
      joined_at: member.joinedAt.toISOString(),
      left_at: member.leftAt?.toISOString() ?? null,
      version: member.version,
    };
  }
}
