import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { currentTraceId } from '@turntable/observability';
import type { Logger } from 'pino';
import { AppModule } from './app.module';
import { APP_LOGGER } from './common/logging/logging.tokens';

function requestId(request: IncomingMessage): string {
  const candidate = request.headers['x-request-id'];
  if (typeof candidate === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) return candidate;
  return randomUUID();
}

export async function createApiApplication(options?: {
  logger?: false;
  initialize?: boolean;
}): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    genReqId: requestId,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
    ...(options?.logger === false ? { logger: false } : {}),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: false,
      stopAtFirstError: false,
      exceptionFactory: (errors) =>
        new UnprocessableEntityException({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          errors: errors.map((error) => ({
            field: error.property,
            reason: Object.values(error.constraints ?? {})[0] ?? 'invalid',
          })),
        }),
    }),
  );
  app.enableShutdownHooks();
  const configuredOrigins = process.env['CORS_ORIGINS']
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: configuredOrigins ?? ['http://localhost:3001', 'http://127.0.0.1:3001'],
    credentials: true,
  });
  const logger = app.get<Logger>(APP_LOGGER);
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      void reply.header('x-request-id', request.id);
      done();
    });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onResponse', (request, reply, done) => {
      logger.info(
        {
          request_id: request.id,
          trace_id: currentTraceId(),
          method: request.method,
          route: request.routeOptions?.url ?? request.url,
          status: reply.statusCode,
          latency_ms: Math.round(reply.elapsedTime * 100) / 100,
        },
        'http request completed',
      );
      done();
    });

  if (options?.initialize !== false) await app.init();
  return app;
}

export function createOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('TurnTable API')
    .setDescription('Phase 0 implementation contract for the TurnTable API-first modular monolith')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'OIDC access token' },
      'oidcBearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.openapi = '3.1.0';
  return document;
}

export function mountOpenApi(app: NestFastifyApplication): OpenAPIObject {
  const document = createOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: '/docs/openapi.json' });
  return document;
}
