import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { startTelemetry } from '@turntable/observability';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  startTelemetry({
    serviceName: 'turntable-worker',
    serviceVersion: process.env['BUILD_VERSION'] ?? '0.0.0-local',
    ...(process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
      ? { endpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] }
      : {}),
  });
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
  app.enableShutdownHooks();
}

void bootstrap();
