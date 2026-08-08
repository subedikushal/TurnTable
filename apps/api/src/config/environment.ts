import { z } from 'zod';

const environmentSchema = z
  .object({
    APP_ENV: z.enum(['local', 'test', 'preview', 'staging', 'production']).default('local'),
    LOG_LEVEL: z.string().default('info'),
    PORT: z.coerce.number().int().positive().max(65_535).default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    AUTH_MODE: z.enum(['oidc', 'development']).default('oidc'),
    OIDC_ISSUER_URL: z.string().url().optional(),
    OIDC_AUDIENCE: z.string().min(1).optional(),
    DEV_AUTH_SECRET: z.string().min(32).optional(),
    INVITATION_TOKEN_SECRET: z.string().min(32),
    CORS_ORIGINS: z.string().min(1).optional(),
    OTEL_SERVICE_NAME: z.string().default('turntable-api'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal('')),
    BUILD_VERSION: z.string().default('0.0.0-local'),
    BUILD_COMMIT: z.string().default('unknown'),
  })
  .superRefine((value, context) => {
    if (value.AUTH_MODE === 'development') {
      if (!['local', 'test'].includes(value.APP_ENV)) {
        context.addIssue({
          code: 'custom',
          path: ['AUTH_MODE'],
          message: 'development authentication is permitted only in local/test environments',
        });
      }
      if (!value.DEV_AUTH_SECRET) {
        context.addIssue({
          code: 'custom',
          path: ['DEV_AUTH_SECRET'],
          message: 'DEV_AUTH_SECRET is required for development authentication',
        });
      }
    }

    if (value.AUTH_MODE === 'oidc') {
      if (!value.OIDC_ISSUER_URL) {
        context.addIssue({
          code: 'custom',
          path: ['OIDC_ISSUER_URL'],
          message: 'OIDC_ISSUER_URL is required for OIDC authentication',
        });
      }
      if (!value.OIDC_AUDIENCE) {
        context.addIssue({
          code: 'custom',
          path: ['OIDC_AUDIENCE'],
          message: 'OIDC_AUDIENCE is required for OIDC authentication',
        });
      }
    }
    if (value.APP_ENV === 'production' && !value.CORS_ORIGINS) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS is required in production',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid TurnTable configuration: ${details}`);
  }
  return parsed.data;
}
