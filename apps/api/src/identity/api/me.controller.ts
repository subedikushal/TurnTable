import { Controller, Get, Inject } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ProblemDetailsDto } from '../../common/problem/problem.dto';
import type { AuthPrincipal } from '../domain/auth-principal';
import { CurrentUserService } from '../application/current-user.service';
import { CurrentPrincipal } from './current-principal.decorator';
import { MeResponseDto } from './me.dto';

@ApiTags('Me')
@ApiBearerAuth('oidcBearer')
@Controller('v1/me')
export class MeController {
  constructor(@Inject(CurrentUserService) private readonly currentUser: CurrentUserService) {}

  @Get()
  @ApiOperation({ operationId: 'getMe', summary: 'Resolve the current local user and memberships' })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  getMe(@CurrentPrincipal() principal: AuthPrincipal): Promise<MeResponseDto> {
    return this.currentUser.getCurrentUser(principal);
  }
}
