import { Controller, Headers, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ProblemDetailsDto } from '../../../common/problem/problem.dto';
import { CurrentPrincipal } from '../../../identity/api/current-principal.decorator';
import { CurrentUserService } from '../../../identity/application/current-user.service';
import type { AuthPrincipal } from '../../../identity/domain/auth-principal';
import { HouseholdsService } from '../application/households.service';
import { MemberDto } from './household.dto';

@ApiTags('Households')
@ApiBearerAuth('oidcBearer')
@ApiUnauthorizedResponse({ type: ProblemDetailsDto })
@Controller('v1/invitations')
export class InvitationsController {
  constructor(
    @Inject(HouseholdsService) private readonly households: HouseholdsService,
    @Inject(CurrentUserService) private readonly currentUsers: CurrentUserService,
  ) {}

  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'acceptInvitation', summary: 'Accept a single-use invitation' })
  @ApiParam({ name: 'token', schema: { type: 'string', minLength: 32 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 8, maxLength: 200 },
  })
  @ApiOkResponse({
    description: 'ACTIVE MEMBER membership created or reactivated',
    type: MemberDto,
  })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async acceptInvitation(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('token') token: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<MemberDto> {
    const current = await this.currentUsers.getCurrentUser(principal);
    return this.households.acceptInvitation(
      current.user.id,
      current.user.email,
      token,
      idempotencyKey ?? '',
    );
  }
}
