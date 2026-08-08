import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { createLogger } from '@turntable/observability';
import type { Environment } from '../../config/environment';
import { ProblemDetailsFilter } from '../problem/problem-details.filter';
import { APP_LOGGER } from './logging.tokens';

@Global()
@Module({
  providers: [
    {
      provide: APP_LOGGER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) =>
        createLogger({
          service: 'turntable-api',
          environment: config.get('APP_ENV', { infer: true }),
          level: config.get('LOG_LEVEL', { infer: true }),
        }),
    },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
  exports: [APP_LOGGER],
})
export class LoggingModule {}
