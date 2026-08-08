import { z } from 'zod';

const schema = z.object({
  APP_ENV: z.enum(['local', 'test', 'preview', 'staging', 'production']).default('local'),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(100).default(5),
  WORKER_PROBE_ON_START: z.enum(['true', 'false']).default('false'),
  BUILD_VERSION: z.string().default('0.0.0-local'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal('')),
});

export type WorkerEnvironment = z.infer<typeof schema>;

export function validateWorkerEnvironment(input: Record<string, unknown>): WorkerEnvironment {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid TurnTable worker configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  }
  return result.data;
}
