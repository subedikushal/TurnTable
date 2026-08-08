import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment';
import type { BuildHealthDto } from './health.dto';

@Injectable()
export class BuildInfoService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Environment, true>) {}

  getBuildInfo(): BuildHealthDto {
    return {
      version: this.config.get('BUILD_VERSION', { infer: true }),
      commit: this.config.get('BUILD_COMMIT', { infer: true }),
      runtime: process.version,
      environment: this.config.get('APP_ENV', { infer: true }),
    };
  }
}
