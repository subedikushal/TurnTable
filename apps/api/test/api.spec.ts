import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { OIDC_TOKEN_VERIFIER, type OidcTokenVerifier } from '../src/identity/domain/auth-principal';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { RedisService } from '../src/infrastructure/redis/redis.service';

const userId = '10000000-0000-4000-8000-000000000001';

describe('Phase 0 API', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    Object.assign(process.env, {
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
      REDIS_URL: 'redis://localhost:6379',
      AUTH_MODE: 'development',
      DEV_AUTH_SECRET: 'turntable-development-secret-at-least-32-characters',
      INVITATION_TOKEN_SECRET: 'turntable-invitation-secret-at-least-32-characters',
      OIDC_AUDIENCE: 'turntable-api',
      BUILD_VERSION: 'test-build',
      BUILD_COMMIT: 'test-commit',
    });

    const { AppModule } = await import('../src/app.module.js');
    const verifier: OidcTokenVerifier = {
      verify: async () => ({
        subject: 'oidc|api-test',
        email: 'api-test@turntable.local',
        displayName: 'API Test',
        scopes: [],
      }),
    };
    const prisma = {
      $queryRaw: async () => [{ count: 1n }],
      user: {
        upsert: async () => ({
          id: userId,
          displayName: 'API Test',
          email: 'api-test@turntable.local',
          memberships: [],
        }),
      },
    };
    const redis = { ping: async () => 'PONG' };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OIDC_TOKEN_VERIFIER)
      .useValue(verifier)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['/health/live', { status: 'ok' }],
    ['/health/ready', { status: 'ok' }],
  ])('GET %s succeeds', async (url, expected) => {
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(expected);
  });

  it('GET /health/build exposes non-secret build metadata', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/build' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ version: 'test-build', commit: 'test-commit' });
    expect(response.body).not.toContain('DEV_AUTH_SECRET');
  });

  it('GET /v1/me rejects unauthenticated requests with problem details', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
  });

  it('GET /v1/me resolves an authenticated local user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: { id: userId, display_name: 'API Test', email: 'api-test@turntable.local' },
      memberships: [],
    });
  });
});
