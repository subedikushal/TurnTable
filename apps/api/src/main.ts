import 'reflect-metadata';
import { startTelemetry } from '@turntable/observability';
import { createApiApplication, mountOpenApi } from './bootstrap';

async function bootstrap(): Promise<void> {
  startTelemetry({
    serviceName: process.env['OTEL_SERVICE_NAME'] ?? 'turntable-api',
    serviceVersion: process.env['BUILD_VERSION'] ?? '0.0.0-local',
    ...(process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
      ? { endpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] }
      : {}),
  });
  const app = await createApiApplication();
  mountOpenApi(app);
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
