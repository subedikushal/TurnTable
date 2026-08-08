import { Module } from '@nestjs/common';
import { BuildInfoService } from './build-info.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, BuildInfoService],
})
export class HealthModule {}
