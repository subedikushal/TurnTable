import { Inject, Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '../domain/auth-principal';
import type { MeResponseDto } from '../api/me.dto';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class UserRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolve(principal: AuthPrincipal): Promise<MeResponseDto> {
    const fallbackName = principal.email?.split('@')[0] ?? 'TurnTable member';
    const user = await this.prisma.user.upsert({
      where: { oidcSubject: principal.subject },
      create: {
        oidcSubject: principal.subject,
        displayName: principal.displayName?.trim() || fallbackName,
        ...(principal.email ? { email: principal.email } : {}),
      },
      update: principal.email ? { email: principal.email } : {},
      include: {
        memberships: {
          orderBy: { joinedAt: 'asc' },
          select: { id: true, householdId: true, role: true, status: true },
        },
      },
    });

    return {
      user: { id: user.id, display_name: user.displayName, email: user.email },
      memberships: user.memberships.map((membership) => ({
        id: membership.id,
        household_id: membership.householdId,
        role: membership.role,
        status: membership.status,
      })),
    };
  }
}
