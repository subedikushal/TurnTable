import { trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import pino, { type Logger } from 'pino';

const REDACT_PATHS = [
  'req.headers.authorization',
  'request.headers.authorization',
  '*.access_token',
  '*.refresh_token',
  '*.password',
  '*.push_token',
  '*.token',
];

export interface LoggerOptions {
  service: string;
  environment: string;
  level?: string;
}

export function createLogger(options: LoggerOptions): Logger {
  return pino({
    name: options.service,
    level: options.level ?? 'info',
    base: { service: options.service, environment: options.environment },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  });
}

export function currentTraceId(): string | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext?.traceId;
}

let sdk: NodeSDK | undefined;

export function startTelemetry(options: {
  serviceName: string;
  serviceVersion: string;
  endpoint?: string;
}): void {
  if (sdk) return;

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion,
    }),
    ...(options.endpoint
      ? {
          traceExporter: new OTLPTraceExporter({
            url: `${options.endpoint.replace(/\/$/, '')}/v1/traces`,
          }),
        }
      : {}),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
}

export async function stopTelemetry(): Promise<void> {
  const activeSdk = sdk;
  sdk = undefined;
  await activeSdk?.shutdown();
}
