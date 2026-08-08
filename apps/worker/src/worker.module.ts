import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createLogger } from '@turntable/observability';
import { validateWorkerEnvironment, type WorkerEnvironment } from './config';
import { WorkerRuntimeService, WORKER_LOGGER } from './worker-runtime.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateWorkerEnvironment }),
  ],
  providers: [
    {
      provide: WORKER_LOGGER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<WorkerEnvironment, true>) =>
        createLogger({
          service: 'turntable-worker',
          environment: config.get('APP_ENV', { infer: true }),
          level: config.get('LOG_LEVEL', { infer: true }),
        }),
    },
    WorkerRuntimeService,
  ],
})
export class WorkerModule {}
