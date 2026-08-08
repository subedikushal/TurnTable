import 'reflect-metadata';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { OIDC_TOKEN_VERIFIER, type OidcTokenVerifier } from '../src/identity/domain/auth-principal';

const execFileAsync = promisify(execFile);

async function applyMigrations(connectionString: string): Promise<void> {
  const repositoryRoot = resolve(process.cwd(), '../..');
  await execFileAsync(
    process.execPath,
    [
      resolve(repositoryRoot, 'node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--config',
      'apps/api/prisma.config.ts',
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, DATABASE_URL: connectionString },
      timeout: 60_000,
    },
  );
}

describe('Phase 0 API with real PostgreSQL and Redis', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:18-alpine')
        .withDatabase('turntable')
        .withUsername('turntable')
        .withPassword('turntable')
        .start(),
      new GenericContainer('redis:8-alpine')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
        .start(),
    ]);
    await applyMigrations(postgres.getConnectionUri());
    Object.assign(process.env, {
      APP_ENV: 'test',
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      AUTH_MODE: 'development',
      DEV_AUTH_SECRET: 'turntable-development-secret-at-least-32-characters',
      INVITATION_TOKEN_SECRET: 'turntable-invitation-secret-at-least-32-characters',
      OIDC_AUDIENCE: 'turntable-api',
    });
    const { AppModule } = await import('../src/app.module.js');
    const verifier: OidcTokenVerifier = {
      verify: async () => ({
        subject: 'oidc|integration-user',
        email: 'integration@turntable.local',
        displayName: 'Integration User',
        scopes: [],
      }),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OIDC_TOKEN_VERIFIER)
      .useValue(verifier)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([postgres?.stop(), redis?.stop()]);
  });

  it('reports ready only after real dependencies and migration history are available', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      checks: { database: 'up', migrations: 'up', redis: 'up' },
    });
  });

  it('persists the external OIDC subject and returns the authenticated /v1/me projection', async () => {
    const first = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer integration-token' },
    });
    const second = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer integration-token' },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
  });
});
