import { Controller, Get, Inject } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ProblemDetailsDto } from '../common/problem/problem.dto';
import { Public } from '../identity/api/public.decorator';
import { BuildInfoService } from './build-info.service';
import { BuildHealthDto, LiveHealthDto, ReadyHealthDto } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly health: HealthService,
    @Inject(BuildInfoService) private readonly buildInfo: BuildInfoService,
  ) {}

  @Get('live')
  @ApiOperation({ operationId: 'getLiveness' })
  @ApiOkResponse({ type: LiveHealthDto })
  liveness(): LiveHealthDto {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ operationId: 'getReadiness' })
  @ApiOkResponse({ type: ReadyHealthDto })
  @ApiServiceUnavailableResponse({ type: ProblemDetailsDto })
  readiness(): Promise<ReadyHealthDto> {
    return this.health.readiness();
  }

  @Get('build')
  @ApiOperation({ operationId: 'getBuildMetadata' })
  @ApiOkResponse({ type: BuildHealthDto })
  build(): BuildHealthDto {
    return this.buildInfo.getBuildInfo();
  }
}
