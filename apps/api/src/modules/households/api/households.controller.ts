import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
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
import {
  CreateHouseholdRequestDto,
  CreateInvitationRequestDto,
  HouseholdDto,
  HouseholdListItemDto,
  InvitationDto,
  MemberDto,
  OwnershipTransferResponseDto,
  TransferOwnershipRequestDto,
  UpdateHouseholdRequestDto,
} from './household.dto';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: true,
  description: '8-200 character opaque key reused only for retries of the same logical command',
  schema: { type: 'string', minLength: 8, maxLength: 200 },
} as const;
const UUID_PIPE = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

@ApiTags('Households')
@ApiBearerAuth('oidcBearer')
@ApiUnauthorizedResponse({ type: ProblemDetailsDto })
@Controller('v1/households')
export class HouseholdsController {
  constructor(
    @Inject(HouseholdsService) private readonly households: HouseholdsService,
    @Inject(CurrentUserService) private readonly currentUsers: CurrentUserService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'createHousehold', summary: 'Create a household as its owner' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiBody({ type: CreateHouseholdRequestDto })
  @ApiOkResponse({
    description: 'Household created with the caller as ACTIVE OWNER',
    type: HouseholdDto,
  })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async createHousehold(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateHouseholdRequestDto,
  ): Promise<HouseholdDto> {
    const current = await this.currentUsers.getCurrentUser(principal);
    return this.households.createHousehold(current.user.id, idempotencyKey ?? '', body);
  }

  @Get()
  @ApiOperation({ operationId: 'listHouseholds', summary: 'List active household memberships' })
  @ApiOkResponse({ description: 'Active household memberships', type: [HouseholdListItemDto] })
  async listHouseholds(
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<HouseholdListItemDto[]> {
    const current = await this.currentUsers.getCurrentUser(principal);
    return this.households.listHouseholds(current.user.id);
  }

  @Get(':householdId')
  @ApiOperation({ operationId: 'getHousehold', summary: 'Read an active household' })
  @ApiParam({ name: 'householdId', type: String, format: 'uuid' })
  @ApiOkResponse({ description: 'Household visible to the active member', type: HouseholdDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async getHousehold(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('householdId', UUID_PIPE) householdId: string,
  ): Promise<HouseholdDto> {
    const current = await this.currentUsers.getCurrentUser(principal);
    return this.households.getHousehold(current.user.id, householdId);
  }

  @Patch(':householdId')
  @ApiOperation({ operationId: 'updateHousehold', summary: 'Update owner-managed settings' })
  @ApiParam({ name: 'householdId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateHouseholdRequestDto })
  @ApiOkResponse({
    description: 'Updated household settings and incremented version',
    type: HouseholdDto,
  })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async updateHousehold(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('householdId', UUID_PIPE) householdId: string,
    @Body() body: UpdateHouseholdRequestDto,
  ): Promise<HouseholdDto> {
    const current = await this.currentUsers.getCurrentUser(principal);
    return this.households.updateHousehold(current.user.id, householdId, body);
  }

  @Get(':householdId/members')
  @ApiOperation({ operationId: 'listMembers', summary: 'List active household members' })
  @ApiParam({ name: 'householdId', type: String, format: 'uuid' })
  @ApiOkResponse({ description: 'Active household members', type: [MemberDto] })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async listMembers(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('householdId', UUID_PIPE) householdId: string,
  ): Promise<MemberDto[]> {
    const current = await this.currentUsers.getCurrentUser(principal);
    return this.households.listMembers(current.user.id, householdId);
  }

  @Post(':householdId/invitations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'createInvitation', summary: 'Create a single-use invitation' })
  @ApiParam({ name: 'householdId', type: String, format: 'uuid' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiBody({ type: CreateInvitationRequestDto })
  @ApiOkResponse({
    description: 'Pending invitation with its one-time raw token',
    type: InvitationDto,
  })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async createInvitation(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('householdId', UUID_PIPE) householdId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateInvitationRequestDto,
  ): Promise<InvitationDto> {
    const current = await this.currentUsers.getCurrentUser(principal);
    return this.households.createInvitation(
      current.user.id,
      householdId,
      idempotencyKey ?? '',
      body,
    );
  }

  @Post(':householdId/ownership-transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'transferOwnership', summary: 'Transfer ownership atomically' })
  @ApiParam({ name: 'householdId', type: String, format: 'uuid' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiBody({ type: TransferOwnershipRequestDto })
  @ApiOkResponse({
    description: 'Atomic old-owner/new-owner membership projection',
    type: OwnershipTransferResponseDto,
  })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async transferOwnership(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('householdId', UUID_PIPE) householdId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: TransferOwnershipRequestDto,
  ): Promise<OwnershipTransferResponseDto> {
    const current = await this.currentUsers.getCurrentUser(principal);
    return this.households.transferOwnership(
      current.user.id,
      householdId,
      idempotencyKey ?? '',
      body,
    );
  }

  @Delete(':householdId/members/:memberId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'removeMember',
    summary: 'Remove a member without deleting history',
  })
  @ApiParam({ name: 'householdId', type: String, format: 'uuid' })
  @ApiParam({ name: 'memberId', type: String, format: 'uuid' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOkResponse({ description: 'Historical membership transitioned to REMOVED', type: MemberDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async removeMember(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('householdId', UUID_PIPE) householdId: string,
    @Param('memberId', UUID_PIPE) memberId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<MemberDto> {
    const current = await this.currentUsers.getCurrentUser(principal);
    return this.households.removeMember(
      current.user.id,
      householdId,
      memberId,
      idempotencyKey ?? '',
    );
  }
}
